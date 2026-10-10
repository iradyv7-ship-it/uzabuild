/**
 * Universal drawing reader.
 *
 * Ported from UZA Blueprint (the same product's earlier fork) — it is the
 * piece of the pipeline that lets an uploaded CAD/BIM file be digested at
 * all, rather than being rejected outright and pushed straight to the human
 * takeoff queue with nothing recovered from it.
 *
 * Turns ANY uploaded file into something the takeoff model can reason about:
 *  - PDF / images  -> passed through natively as a file part
 *  - text-based CAD/BIM exchange formats (DXF, IFC/STEP, SVG, CSV, XML, JSON)
 *    -> parsed into a structured digest of layers, spaces, schedules and text
 *  - proprietary binaries (DWG, RVT, RFA, SKP, NWD) -> readable strings, layer
 *    and room labels, schedule text and embedded metadata are salvaged
 *
 * Spreadsheets (XLSX/XLS/ODS/CSV/TSV) and Word/PowerPoint documents go
 * through real parsers (office-reader.server.ts) via `readAnyDocument`, never
 * the lossy label salvage. Image formats the model cannot take (HEIC, TIFF,
 * BMP) and images over the API's ~5 MB limit are returned as `unsupported`
 * with a reason a person can act on, instead of failing inside the API call.
 * Everything else is still read somehow: the worst case is a low-confidence
 * takeoff built from whatever the reader could recover, marked `degraded` so
 * it is never confused with a measured sheet.
 */
import {
  docxToText,
  isSpreadsheet,
  pptxToText,
  spreadsheetToText,
} from "@/lib/office-reader.server";

export type ReaderMode = "file" | "text" | "unsupported";

export type ReadResult = {
  mode: ReaderMode;
  /** Only present for `file` mode. */
  bytes?: Uint8Array;
  mimeType?: string;
  /** Only present for `text` mode. */
  text?: string;
  /** Only present for `unsupported` mode: what the person should do instead. */
  reason?: string;
  /** How the content was recovered, shown to the QS for transparency. */
  method: string;
  /** True when the content is a lossy salvage rather than the real sheet. */
  degraded: boolean;
};

const NATIVE_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Media types the model accepts as a file block. */
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** Image formats phones and scanners produce that the model cannot take. */
const UNREADABLE_IMAGES = new Set(["heic", "heif", "tif", "tiff", "bmp"]);

/** The model rejects images above about 5 MB; check before sending. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const TEXT_FORMATS = new Set([
  "dxf",
  "ifc",
  "ifcxml",
  "step",
  "stp",
  "svg",
  "txt",
  "json",
  "xml",
  "md",
  "obj",
  "gbxml",
  "3dm",
]);

export function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

const MAX_DIGEST_CHARS = 60_000;

function clamp(text: string) {
  return text.length > MAX_DIGEST_CHARS ? `${text.slice(0, MAX_DIGEST_CHARS)}\n…(truncated)` : text;
}

function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Printable ASCII runs — recovers labels from any binary container. */
function asciiStrings(bytes: Uint8Array, min = 4) {
  const out: string[] = [];
  let current = "";
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= min) out.push(current);
    current = "";
  }
  if (current.length >= min) out.push(current);
  return out;
}

/** UTF-16LE runs — Revit/Navisworks store most labels this way. */
function utf16Strings(bytes: Uint8Array, min = 4) {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8);
    if (code >= 0x20 && code <= 0x7e) {
      current += String.fromCharCode(code);
      continue;
    }
    if (current.length >= min) out.push(current);
    current = "";
  }
  if (current.length >= min) out.push(current);
  return out;
}

const NOISE = /^[\s\d.,:;_\-+/\\()[\]{}<>|*#@%^&=~`'"]*$/;

function interestingLabels(strings: string[], limit = 400) {
  const seen = new Map<string, number>();
  for (const raw of strings) {
    const value = raw.trim();
    if (value.length < 3 || value.length > 120) continue;
    if (NOISE.test(value)) continue;
    if (!/[a-z]/i.test(value)) continue;
    // Drop obvious file-format plumbing.
    if (
      /^(acad|autocad|adsk|revit|schema|ifc[0-9]|http|urn:|xmlns|microsoft|windows|arial|calibri)/i.test(
        value,
      )
    )
      continue;
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => (count > 1 ? `${value} (x${count})` : value));
}

function section(title: string, values: string[]) {
  if (!values.length) return "";
  return `## ${title}\n${values.join("\n")}\n`;
}

/** DXF is a tagged text format: pairs of (group code, value) lines. */
function digestDxf(raw: string) {
  const lines = raw.split(/\r?\n/);
  const layers = new Set<string>();
  const texts: string[] = [];
  const blocks = new Set<string>();
  const entities = new Map<string, number>();

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = (lines[i] ?? "").trim();
    const value = lines[i + 1]?.trim() ?? "";
    if (!value) continue;
    if (code === "0") entities.set(value, (entities.get(value) ?? 0) + 1);
    else if (code === "8") layers.add(value);
    else if (code === "1" || code === "3") texts.push(value);
    else if (code === "2" && /^[A-Za-z]/.test(value)) blocks.add(value);
  }

  const entityList = [...entities.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`);

  return [
    section("Entity counts", entityList.slice(0, 60)),
    section("Layers", [...layers].slice(0, 200)),
    section("Blocks / families", [...blocks].slice(0, 200)),
    section("Text, room labels and dimension notes", interestingLabels(texts, 500)),
  ]
    .filter(Boolean)
    .join("\n");
}

/** IFC / STEP: one entity per line, quoted attributes carry the names. */
function digestIfc(raw: string) {
  const entities = new Map<string, number>();
  const spaces: string[] = [];
  const products: string[] = [];
  const quantities: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = /=\s*(IFC[A-Z0-9_]+)\s*\((.*)\)\s*;?\s*$/i.exec(line.trim());
    if (!match) continue;
    const [, type, args] = match;
    const upper = (type ?? "").toUpperCase();
    entities.set(upper, (entities.get(upper) ?? 0) + 1);

    const quoted = [...(args ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
    const label = quoted.slice(0, 3).join(" · ");

    if (upper === "IFCSPACE" || upper === "IFCZONE" || upper === "IFCBUILDINGSTOREY") {
      if (label) spaces.push(`${upper}: ${label}`);
    } else if (
      /^IFC(DOOR|WINDOW|WALL|SLAB|COVERING|FURNITURE|SANITARYTERMINAL|LIGHTFIXTURE|CURTAINWALL|STAIR|RAILING)/.test(
        upper,
      )
    ) {
      if (label) products.push(`${upper}: ${label}`);
    } else if (/^IFCQUANTITY(AREA|LENGTH|VOLUME|COUNT)/.test(upper)) {
      const numbers = [...(args ?? "").matchAll(/(-?\d+\.\d+(?:E[+-]?\d+)?)/gi)].map((m) => m[1]);
      if (label || numbers.length) quantities.push(`${upper}: ${label} = ${numbers.join(", ")}`);
    }
  }

  const entityList = [...entities.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`);

  return [
    section("Entity counts", entityList.slice(0, 80)),
    section("Spaces, zones and storeys", spaces.slice(0, 300)),
    section("Building elements", products.slice(0, 400)),
    section("Declared quantities (IFC base quantities)", quantities.slice(0, 400)),
  ]
    .filter(Boolean)
    .join("\n");
}

function digestGenericText(raw: string) {
  const stripped = raw.replace(/<[^>]+>/g, " ");
  return section("Document content", interestingLabels(stripped.split(/[\n\r\t,;]+/), 800));
}

/** Last-resort salvage for proprietary binaries (DWG, RVT, RFA, SKP, NWD). */
function digestBinary(bytes: Uint8Array, ext: string) {
  const combined = interestingLabels([...asciiStrings(bytes), ...utf16Strings(bytes)], 600);
  const versionTag = decode(bytes.subarray(0, 16))
    .replace(/[^\x20-\x7e]/g, "")
    .trim();

  return [
    `## Container\nProprietary ${ext.toUpperCase()} file, ${bytes.length} bytes${
      versionTag ? `, signature "${versionTag}"` : ""
    }.`,
    section("Recovered labels (layers, families, room names, schedule text)", combined),
  ]
    .filter(Boolean)
    .join("\n");
}

export function readAnyDrawing(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): ReadResult {
  const ext = extensionOf(args.fileName);
  if (
    UNREADABLE_IMAGES.has(ext) ||
    (args.mimeType && /^image\/(heic|heif|tiff|bmp)/.test(args.mimeType))
  ) {
    return {
      mode: "unsupported",
      method: `${(ext || "image").toUpperCase()} image`,
      reason: `${(ext || "This image").toUpperCase()} images cannot be read automatically — export the page as PDF or JPG and upload that, or measure it by hand.`,
      degraded: true,
    };
  }

  const nativeMime =
    NATIVE_MIME[ext] ?? (args.mimeType && ACCEPTED_MIME.has(args.mimeType) ? args.mimeType : null);

  if (nativeMime) {
    if (nativeMime.startsWith("image/") && args.bytes.byteLength > MAX_IMAGE_BYTES) {
      return {
        mode: "unsupported",
        method: `Image over ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        reason: `This image is ${(args.bytes.byteLength / 1024 / 1024).toFixed(1)} MB — the reader takes images up to 5 MB. Send a smaller photo, or the drawing as a PDF.`,
        degraded: true,
      };
    }
    return {
      mode: "file",
      bytes: args.bytes,
      mimeType: nativeMime,
      method: `Read natively as ${nativeMime}`,
      degraded: false,
    };
  }

  if (TEXT_FORMATS.has(ext)) {
    const raw = decode(args.bytes);
    let digest: string;
    let method: string;
    if (ext === "dxf") {
      digest = digestDxf(raw);
      method = "Parsed DXF entities, layers and annotation text";
    } else if (ext === "ifc" || ext === "step" || ext === "stp" || ext === "ifcxml") {
      digest = digestIfc(raw);
      method = "Parsed IFC/STEP entities, spaces and base quantities";
    } else {
      digest = digestGenericText(raw);
      method = `Parsed ${ext.toUpperCase()} text content`;
    }
    return { mode: "text", text: clamp(digest), method, degraded: true };
  }

  return {
    mode: "text",
    text: clamp(digestBinary(args.bytes, ext || "binary")),
    method: `Salvaged readable labels from the ${(ext || "binary").toUpperCase()} container`,
    degraded: true,
  };
}

/**
 * The entry point for every upload: real parsers for spreadsheets and Office
 * documents, then the drawing reader for everything else.
 */
export async function readAnyDocument(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): Promise<ReadResult> {
  const ext = extensionOf(args.fileName);
  try {
    if (isSpreadsheet(ext)) {
      const sheet = spreadsheetToText(args.bytes, args.fileName);
      const summary = sheet.sheets.map((s) => `${s.name} (${s.included} rows)`).join(", ");
      return {
        mode: "text",
        text: sheet.text,
        method: `Parsed spreadsheet: ${summary || "no data"}${sheet.truncated ? " — truncated" : ""}`,
        degraded: false,
      };
    }
    if (ext === "docx") {
      return {
        mode: "text",
        text: await docxToText(args.bytes),
        method: "Extracted Word document text",
        degraded: false,
      };
    }
    if (ext === "pptx") {
      return {
        mode: "text",
        text: await pptxToText(args.bytes),
        method: "Extracted PowerPoint slide text",
        degraded: false,
      };
    }
  } catch (e) {
    return {
      mode: "unsupported",
      method: `${ext.toUpperCase()} parse failed`,
      reason: `This ${ext.toUpperCase()} file could not be opened (${e instanceof Error ? e.message : "unreadable"}). Re-save it and upload again.`,
      degraded: true,
    };
  }
  if (ext === "doc" || ext === "ppt") {
    return {
      mode: "unsupported",
      method: `Legacy ${ext.toUpperCase()}`,
      reason: `Old .${ext} files cannot be read automatically — save it as .${ext}x or PDF and upload that.`,
      degraded: true,
    };
  }
  return readAnyDrawing(args);
}
