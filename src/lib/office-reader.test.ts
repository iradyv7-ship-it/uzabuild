import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  docxToText,
  listZipEntries,
  officeXmlToText,
  pptxToText,
  spreadsheetToText,
} from "@/lib/office-reader.server";
import { readAnyDocument } from "@/lib/drawing-reader.server";
import { chunkSheetText, methodForUnit } from "@/lib/boq-import.functions";

/** Builds a zip archive in memory: `deflate` entries via CompressionStream, else stored. */
async function makeZip(files: Record<string, string>, deflate = true): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(content);
    const data = deflate
      ? new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw")),
          ).arrayBuffer(),
        )
      : raw;
    const method = deflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const DOCX_BODY =
  "<w:document><w:body><w:p><w:r><w:t>Finishes specification</w:t></w:r></w:p>" +
  "<w:p><w:r><w:t>Floor tiles</w:t></w:r><w:r><w:tab/><w:t>60 &amp; 120</w:t></w:r></w:p>" +
  "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Room</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Area</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
  "</w:body></w:document>";

describe("spreadsheetToText", () => {
  it("keeps every number, the row numbers and the row order", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Item", "Description", "Unit", "Qty", "Rate"],
        ["1.1", "Porcelain tiles 60x120", "m2", 245.5, 18500],
        [],
        ["1.2", "Skirting", "m", 120, ""],
      ]),
      "Finishes",
    );
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const out = spreadsheetToText(bytes, "boq.xlsx");

    expect(out.truncated).toBe(false);
    expect(out.sheets).toEqual([{ name: "Finishes", rows: 4, included: 3 }]);
    expect(out.text).toContain("## Sheet: Finishes");
    expect(out.text).toContain("2\t1.1\tPorcelain tiles 60x120\tm2\t245.5\t18500");
    // The blank spreadsheet row is dropped but the next row keeps its real number.
    expect(out.text).toContain("4\t1.2\tSkirting\tm\t120");
    expect(out.text.indexOf("1.1")).toBeLessThan(out.text.indexOf("1.2"));
  });

  it("reads CSV text with numbers intact", () => {
    const csv = "Description,Unit,Qty\nGypsum ceiling,m2,88.25\nDownlights,no,24\n";
    const out = spreadsheetToText(new TextEncoder().encode(csv), "schedule.csv");
    expect(out.text).toContain("2\tGypsum ceiling\tm2\t88.25");
    expect(out.text).toContain("3\tDownlights\tno\t24");
  });
});

describe("officeXmlToText", () => {
  it("keeps paragraphs, tabs, table rows and decodes entities", () => {
    expect(officeXmlToText(DOCX_BODY)).toBe(
      "Finishes specification\nFloor tiles\t60 & 120\nRoom\tArea",
    );
  });
});

describe("zip-based Office documents", () => {
  it("reads DOCX body text from a deflated archive", async () => {
    const zip = await makeZip({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": DOCX_BODY,
    });
    expect(listZipEntries(zip).map((e) => e.name)).toEqual([
      "[Content_Types].xml",
      "word/document.xml",
    ]);
    expect(await docxToText(zip)).toContain("Floor tiles\t60 & 120");
  });

  it("reads PPTX slides in numeric order from a stored archive", async () => {
    const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const zip = await makeZip(
      {
        "ppt/slides/slide10.xml": slide("Ten"),
        "ppt/slides/slide2.xml": slide("Two"),
        "ppt/slides/slide1.xml": slide("One"),
      },
      false,
    );
    const text = await pptxToText(zip);
    expect(text.indexOf("Slide 1")).toBeLessThan(text.indexOf("Slide 2"));
    expect(text.indexOf("Slide 2")).toBeLessThan(text.indexOf("Slide 10"));
    expect(text).toContain("Two");
  });
});

describe("readAnyDocument routing", () => {
  it("sends spreadsheets through the real parser, not the salvage", async () => {
    const r = await readAnyDocument({
      bytes: new TextEncoder().encode("a,b\n1,2\n"),
      fileName: "x.csv",
    });
    expect(r.mode).toBe("text");
    expect(r.degraded).toBe(false);
    expect(r.text).toContain("2\t1\t2");
  });

  it("refuses HEIC/TIFF with a reason instead of sending them to the model", async () => {
    for (const fileName of ["photo.heic", "scan.tiff", "plan.bmp"]) {
      const r = await readAnyDocument({ bytes: new Uint8Array([1, 2, 3]), fileName });
      expect(r.mode).toBe("unsupported");
      expect(r.reason).toMatch(/PDF or JPG/);
    }
  });

  it("refuses images over 5 MB before calling the model", async () => {
    const r = await readAnyDocument({
      bytes: new Uint8Array(5 * 1024 * 1024 + 1),
      fileName: "site.jpg",
    });
    expect(r.mode).toBe("unsupported");
    expect(r.reason).toMatch(/5 MB/);
  });

  it("still passes PDFs through natively", async () => {
    const r = await readAnyDocument({
      bytes: new Uint8Array([37, 80, 68, 70]),
      fileName: "plan.pdf",
    });
    expect(r.mode).toBe("file");
    expect(r.mimeType).toBe("application/pdf");
  });
});

describe("BOQ import helpers", () => {
  it("chunks sheet text on row boundaries and repeats the sheet header", () => {
    const rows = Array.from({ length: 50 }, (_, i) => `${i + 2}\tItem ${i}\tm2\t${i}`).join("\n");
    const chunks = chunkSheetText(`## Sheet: BOQ\n${rows}`, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.startsWith("## Sheet: BOQ")).toBe(true);
    const all = chunks.join("\n");
    for (let i = 0; i < 50; i++) expect(all).toContain(`\tItem ${i}\t`);
  });

  it("infers the measurement method from the unit", () => {
    expect(methodForUnit("m²")).toBe("area");
    expect(methodForUnit("SQM")).toBe("area");
    expect(methodForUnit("m3")).toBe("volume");
    expect(methodForUnit("lm")).toBe("linear");
    expect(methodForUnit("Item")).toBe("lump");
    expect(methodForUnit("nr")).toBe("count");
  });
});
