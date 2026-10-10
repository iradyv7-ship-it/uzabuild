/**
 * Office formats the universal drawing reader could only salvage as noise:
 * spreadsheets (XLSX, XLS, ODS, CSV, TSV) and Word / PowerPoint documents
 * (DOCX, PPTX).
 *
 * Spreadsheets are parsed with SheetJS into per-sheet tab-separated text that
 * keeps every number and the original row order — an existing BOQ or a
 * factory price list is useless to a quantity surveyor once its quantities are
 * stripped out. DOCX and PPTX are zip archives of XML; a minimal zip reader
 * (stored and deflate entries, decompressed with the runtime's
 * DecompressionStream) pulls out the document and slide text with paragraph
 * breaks kept. No dependency beyond SheetJS, which the app already ships.
 */
import * as XLSX from "xlsx";

export const SPREADSHEET_EXTENSIONS = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv"] as const;
export const WORD_EXTENSIONS = ["docx"] as const;
export const SLIDE_EXTENSIONS = ["pptx"] as const;

/** Enough for a large BOQ; beyond it the model is told the sheet was cut. */
const MAX_SPREADSHEET_CHARS = 150_000;
const MAX_ROWS_PER_SHEET = 4_000;
const MAX_DOCUMENT_CHARS = 120_000;

export function isSpreadsheet(ext: string) {
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(ext);
}

/* ------------------------------------------------------------------ */
/* Spreadsheets                                                        */
/* ------------------------------------------------------------------ */

export type SpreadsheetText = {
  text: string;
  sheets: { name: string; rows: number; included: number }[];
  truncated: boolean;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\t\r\n]+/g, " ")
    .trim();
}

/**
 * Every sheet as tab-separated rows, prefixed with its spreadsheet row number
 * so a reviewer can find the source line. Empty rows are dropped; numbers are
 * kept exactly as SheetJS formats them.
 */
export function spreadsheetToText(bytes: Uint8Array, fileName = "spreadsheet"): SpreadsheetText {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const workbook =
    ext === "csv" || ext === "tsv"
      ? XLSX.read(new TextDecoder("utf-8", { fatal: false }).decode(bytes), {
          type: "string",
          raw: false,
          ...(ext === "tsv" ? { FS: "\t" } : {}),
        })
      : XLSX.read(bytes, { type: "array", cellDates: false });

  const parts: string[] = [];
  const sheets: SpreadsheetText["sheets"] = [];
  let used = 0;
  let truncated = false;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      // Keep blank rows so each index maps to the real spreadsheet row
      // number a reviewer will look for; empty rows are skipped below.
      blankrows: true,
    });
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    const firstRow = (range?.s.r ?? 0) + 1;

    const lines: string[] = [];
    let included = 0;
    for (let i = 0; i < rows.length; i++) {
      const cells = (rows[i] ?? []).map(cellText);
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (cells.length === 0) continue;
      if (included >= MAX_ROWS_PER_SHEET) {
        truncated = true;
        break;
      }
      const line = `${firstRow + i}\t${cells.join("\t")}`;
      if (used + line.length > MAX_SPREADSHEET_CHARS) {
        truncated = true;
        break;
      }
      lines.push(line);
      used += line.length + 1;
      included++;
    }
    sheets.push({ name, rows: rows.length, included });
    if (lines.length)
      parts.push(
        `## Sheet: ${name}\n(row number, then the cells of that row, tab-separated)\n${lines.join("\n")}`,
      );
    if (truncated) break;
  }

  if (truncated) {
    parts.push(
      `…(truncated: only the first ${used.toLocaleString("en-GB")} characters were included — split the workbook to read the rest)`,
    );
  }
  return { text: parts.join("\n\n"), sheets, truncated };
}

/* ------------------------------------------------------------------ */
/* Zip (DOCX / PPTX)                                                   */
/* ------------------------------------------------------------------ */

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function readU16(b: Uint8Array, at: number) {
  return (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
}
function readU32(b: Uint8Array, at: number) {
  return (
    ((b[at] ?? 0) |
      ((b[at + 1] ?? 0) << 8) |
      ((b[at + 2] ?? 0) << 16) |
      ((b[at + 3] ?? 0) << 24)) >>>
    0
  );
}

/** Lists the entries of a zip archive from its central directory. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65535 bytes.
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (readU32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive.");
  const count = readU16(bytes, eocd + 10);
  let at = readU32(bytes, eocd + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (readU32(bytes, at) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = readU16(bytes, at + 10);
    const compressedSize = readU32(bytes, at + 20);
    const nameLength = readU16(bytes, at + 28);
    const extraLength = readU16(bytes, at + 30);
    const commentLength = readU16(bytes, at + 32);
    const localHeaderOffset = readU32(bytes, at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads one entry's bytes (stored or deflate). */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const at = entry.localHeaderOffset;
  if (readU32(bytes, at) !== 0x04034b50) throw new Error(`Corrupt zip entry ${entry.name}.`);
  const start = at + 30 + readU16(bytes, at + 26) + readU16(bytes, at + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error(`Unsupported zip compression (method ${entry.method}) in ${entry.name}.`);
}

/* ------------------------------------------------------------------ */
/* Office XML → text                                                   */
/* ------------------------------------------------------------------ */

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * WordprocessingML / DrawingML to plain text: one line per paragraph, tabs
 * and line breaks kept, table cells separated by tabs and rows by newlines.
 */
export function officeXmlToText(xml: string): string {
  // A table cell's paragraphs are one value: join them with spaces and end
  // the cell with a tab, so a table row reads as columns on one line.
  const cells = xml.replace(
    /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g,
    (_, inner: string) => `${inner.replace(/<\/w:p>/g, " ")}\t`,
  );
  const text = cells
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<a:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<a:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) =>
      line
        .replace(/ +\t/g, "\t")
        .replace(/[ \t]+$/g, "")
        .replace(/ {2,}/g, " "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampDocument(text: string) {
  return text.length > MAX_DOCUMENT_CHARS
    ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n…(truncated — split the document to read the rest)`
    : text;
}

/** Text of a .docx: the body, then headers/footers (title blocks often live there). */
export async function docxToText(bytes: Uint8Array): Promise<string> {
  const entries = listZipEntries(bytes);
  const decoder = new TextDecoder("utf-8");
  const body = entries.find((e) => e.name === "word/document.xml");
  if (!body) throw new Error("This .docx has no document body.");
  const parts = [officeXmlToText(decoder.decode(await readZipEntry(bytes, body)))];
  for (const e of entries.filter((x) => /^word\/(header|footer)\d*\.xml$/.test(x.name))) {
    const t = officeXmlToText(decoder.decode(await readZipEntry(bytes, e)));
    if (t) parts.push(`## ${e.name.includes("header") ? "Header" : "Footer"}\n${t}`);
  }
  return clampDocument(parts.filter(Boolean).join("\n\n"));
}

/** Text of a .pptx, slide by slide in order, with speaker notes. */
export async function pptxToText(bytes: Uint8Array): Promise<string> {
  const entries = listZipEntries(bytes);
  const decoder = new TextDecoder("utf-8");
  const slideNo = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
  const slides = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
    .sort((a, b) => slideNo(a.name) - slideNo(b.name));
  if (slides.length === 0) throw new Error("This .pptx has no slides.");
  const notes = new Map(
    entries
      .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e.name))
      .map((e) => [slideNo(e.name), e] as const),
  );
  const parts: string[] = [];
  for (const s of slides) {
    const n = slideNo(s.name);
    let block = `## Slide ${n}\n${officeXmlToText(decoder.decode(await readZipEntry(bytes, s)))}`;
    const note = notes.get(n);
    if (note) {
      const t = officeXmlToText(decoder.decode(await readZipEntry(bytes, note)));
      if (t) block += `\nNotes: ${t}`;
    }
    parts.push(block);
  }
  return clampDocument(parts.join("\n\n"));
}
