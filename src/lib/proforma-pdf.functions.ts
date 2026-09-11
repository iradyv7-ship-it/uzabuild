import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UZA_ISSUER } from "@/config/company";
import { formatMoney, formatQuantity, lineAmount } from "@/lib/pricing";
import { englishUnit } from "@/lib/proforma";

/**
 * Renders an issued (or draft) proforma as a real PDF file on the UZA
 * letterhead, so it can be attached to an email to the client.
 *
 * The document is USD-only: the RMB basis, the factory and the exchange rate
 * never appear on a client-facing page.
 */
export const buildProformaPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { proformaId: string }) => ({ proformaId: String(data.proformaId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: proforma, error } = await supabase
      .from("proformas")
      .select(
        "id, reference, title, status, issued_at, incoterm, payment_terms, lead_time_note, validity_days, notes, project_id, client_id, signed_by_name, signed_by_title, signed_at",
      )
      .eq("id", data.proformaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proforma) throw new Error("That proforma is not available to you.");

    const [{ data: lines }, { data: project }, { data: client }] = await Promise.all([
      supabase
        .from("proforma_lines")
        .select("description, specification, unit, quantity, unit_price_usd_minor, sort_order")
        .eq("proforma_id", proforma.id)
        .order("sort_order"),
      supabase.from("projects").select("name").eq("id", proforma.project_id).maybeSingle(),
      proforma.client_id
        ? supabase
            .from("clients")
            .select("name, contact_name, address, city, country, tin, billing_email, email")
            .eq("id", proforma.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const rows = lines ?? [];
    if (rows.length === 0) throw new Error("This proforma has no lines yet, so there is nothing to attach.");

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const ink = rgb(0.09, 0.11, 0.13);
    const muted = rgb(0.42, 0.45, 0.5);
    const rule = rgb(0.82, 0.84, 0.87);

    let page = pdf.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const left = 48;
    const right = width - 48;
    let y = height - 56;

    /**
     * The standard PDF fonts only carry WinAnsi characters, and factory text
     * arrives with Chinese glyphs and unit symbols. Keep what prints, spell out
     * the rest, and never fail the document over a character.
     */
    function ansi(value: string): string {
      return value
        .replace(/㎡/g, "m2")
        .replace(/㎠/g, "m2")
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/·/g, "-")
        .replace(/•/g, "-")
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function text(
      value: string,
      x: number,
      atY: number,
      opts: { size?: number; font?: typeof regular; color?: typeof ink } = {},
    ) {
      page.drawText(ansi(value), {
        x,
        y: atY,
        size: opts.size ?? 9.5,
        font: opts.font ?? regular,
        color: opts.color ?? ink,
      });
    }

    function rightText(value: string, atY: number, opts: { size?: number; font?: typeof regular; color?: typeof ink } = {}) {
      const font = opts.font ?? regular;
      const size = opts.size ?? 9.5;
      value = ansi(value);
      text(value, right - font.widthOfTextAtSize(value, size), atY, opts);
    }

    function line(atY: number) {
      page.drawLine({ start: { x: left, y: atY }, end: { x: right, y: atY }, thickness: 0.7, color: rule });
    }

    function newPage() {
      page = pdf.addPage([595.28, 841.89]);
      y = height - 56;
    }

    // Letterhead
    text(UZA_ISSUER.legalName, left, y, { size: 16, font: bold });
    rightText("PROFORMA INVOICE", y, { size: 13, font: bold });
    y -= 15;
    text(UZA_ISSUER.division, left, y, { color: muted });
    rightText(proforma.reference, y, { font: bold });
    y -= 13;
    for (const addressLine of UZA_ISSUER.addressLines) {
      text(addressLine, left, y, { color: muted, size: 9 });
      y -= 11;
    }
    text(`${UZA_ISSUER.phone}   ${UZA_ISSUER.email}`, left, y, { color: muted, size: 9 });

    const issued = proforma.issued_at ? new Date(proforma.issued_at) : null;
    rightText(
      issued ? `Issued ${issued.toLocaleDateString("en-GB")}` : "Draft — not yet issued",
      y + 24,
      { color: muted, size: 9 },
    );
    rightText(`Valid ${proforma.validity_days} days`, y + 13, { color: muted, size: 9 });

    y -= 18;
    line(y);
    y -= 22;

    // Client + project block
    text("Billed to", left, y, { size: 8.5, font: bold, color: muted });
    text("Project", left + 280, y, { size: 8.5, font: bold, color: muted });
    y -= 14;
    const billed = [
      client?.name ?? "Client to be confirmed",
      client?.contact_name ?? "",
      client?.address ?? "",
      [client?.city, client?.country].filter(Boolean).join(", "),
      client?.tin ? `TIN ${client.tin}` : "",
    ].filter((v) => v !== "");
    const projectBlock = [project?.name ?? "", proforma.title].filter((v) => v !== "");
    const blockRows = Math.max(billed.length, projectBlock.length);
    for (let i = 0; i < blockRows; i += 1) {
      if (billed[i]) text(billed[i]!, left, y);
      if (projectBlock[i]) text(projectBlock[i]!, left + 280, y);
      y -= 12;
    }

    y -= 12;
    line(y);
    y -= 16;

    // Table header
    const colQty = left + 268;
    const colUnit = left + 312;
    const colRate = left + 352;
    /** Right edge the rate column is aligned to, so it never runs into the amount. */
    const rateRight = right - 96;
    function rateText(value: string, atY: number, opts: { size?: number; font?: typeof regular } = {}) {
      const font = opts.font ?? regular;
      const size = opts.size ?? 8.5;
      const clean = ansi(value);
      text(clean, rateRight - font.widthOfTextAtSize(clean, size), atY, { size, font });
    }
    text("Description", left, y, { size: 8.5, font: bold, color: muted });
    text("Qty", colQty, y, { size: 8.5, font: bold, color: muted });
    text("Unit", colUnit, y, { size: 8.5, font: bold, color: muted });
    rightText("Amount (USD)", y, { size: 8.5, font: bold, color: muted });
    text("Rate (USD)", colRate, y, { size: 8.5, font: bold, color: muted });
    y -= 8;
    line(y);
    y -= 14;

    function wrap(raw: string, maxWidth: number, size: number): string[] {
      const value = ansi(raw);
      if (value === "") return [];
      const words = value.split(/\s+/);
      const out: string[] = [];
      let current = "";
      for (const word of words) {
        const next = current === "" ? word : `${current} ${word}`;
        if (regular.widthOfTextAtSize(next, size) > maxWidth && current !== "") {
          out.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current !== "") out.push(current);
      return out.length > 0 ? out : [""];
    }

    let total = 0;
    for (const row of rows) {
      const amount = lineAmount(Number(row.quantity), Number(row.unit_price_usd_minor));
      total += amount;

      const descriptionLines = wrap(row.description, 252, 9.5);
      const specLines = row.specification ? wrap(row.specification, 252, 8) : [];
      const blockHeight = descriptionLines.length * 12 + specLines.length * 10 + 8;
      if (y - blockHeight < 96) newPage();

      const rowTop = y;
      for (const l of descriptionLines) {
        text(l, left, y);
        y -= 12;
      }
      for (const l of specLines) {
        text(l, left, y, { size: 8, color: muted });
        y -= 10;
      }
      text(formatQuantity(Number(row.quantity)), colQty, rowTop);
      text(ansi(englishUnit(row.unit)) || "no.", colUnit, rowTop, { size: 8.5 });
      rateText(formatMoney(Number(row.unit_price_usd_minor), "USD"), rowTop);
      rightText(formatMoney(amount, "USD"), rowTop);
      y -= 6;
      line(y);
      y -= 12;
    }

    if (y < 150) newPage();
    y -= 4;
    rateText("Total", y, { font: bold, size: 10 });
    rightText(formatMoney(total, "USD"), y, { font: bold, size: 11 });
    y -= 24;

    const terms = [
      proforma.incoterm ? `Incoterm: ${proforma.incoterm}` : "",
      proforma.payment_terms ? `Payment: ${proforma.payment_terms}` : "",
      proforma.lead_time_note ?? "",
      proforma.notes ?? "",
      `All amounts in United States Dollars. This proforma is issued by ${UZA_ISSUER.legalName} and is valid for ${proforma.validity_days} days from the issue date.`,
    ].filter((v) => v !== "");

    text("Terms", left, y, { size: 8.5, font: bold, color: muted });
    y -= 14;
    for (const term of terms) {
      for (const l of wrap(term, right - left, 8.5)) {
        if (y < 60) newPage();
        text(l, left, y, { size: 8.5, color: muted });
        y -= 11;
      }
      y -= 3;
    }

    // Signature block — typed name and title, never a fake handwritten mark.
    if (y < 120) newPage();
    y -= 10;
    line(y);
    y -= 16;
    text(`Signed for and on behalf of ${UZA_ISSUER.legalName}`, left, y, {
      size: 8.5,
      font: bold,
      color: muted,
    });
    y -= 18;
    if (proforma.signed_by_name) {
      text(proforma.signed_by_name, left, y, { size: 12, font: bold });
      y -= 13;
      if (proforma.signed_by_title) {
        text(proforma.signed_by_title, left, y, { size: 9, color: muted });
        y -= 11;
      }
      text(UZA_ISSUER.division, left, y, { size: 9, color: muted });
      y -= 11;
      const signedOn = proforma.signed_at
        ? ` on ${new Date(proforma.signed_at).toLocaleDateString("en-GB")}`
        : "";
      text(`Signed electronically${signedOn} - Reference ${proforma.reference}`, left, y, {
        size: 8.5,
        color: muted,
      });
      y -= 11;
      text(
        "Typed electronic signature identifying the authorised signatory and date of signing.",
        left,
        y,
        { size: 7.5, color: muted },
      );
    } else {
      text("Not yet signed.", left, y, { size: 9, color: muted });
    }

    const bytes = await pdf.save();
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    const safeReference = proforma.reference.replace(/[^\w.-]+/g, "-");
    return {
      fileName: `${safeReference}.pdf`,
      base64: btoa(binary),
      clientEmail: client?.billing_email ?? client?.email ?? null,
      clientName: client?.name ?? null,
      contactName: client?.contact_name ?? null,
      reference: proforma.reference,
      projectName: project?.name ?? "",
      totalUsdMinor: total,
      issued: proforma.status !== "draft",
    };
  });
