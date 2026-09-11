import { UZA_ISSUER } from "@/config/company";
import { formatMoney, formatQuantity, lineAmount, toMinor } from "@/lib/pricing";
import { englishUnit, rollUpProforma } from "@/lib/proforma";

export type ProformaHeader = {
  reference: string;
  title: string;
  status: string;
  issued_at: string | null;
  incoterm: string | null;
  payment_terms: string | null;
  lead_time_note: string | null;
  validity_days: number;
  notes: string | null;
  fx_rmb_per_usd: number;
  signed_by_name?: string | null;
  signed_by_title?: string | null;
  signed_at?: string | null;
};

export type ProformaClient = {
  name: string;
  contact_name: string | null;
  company_registration: string | null;
  tin: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  billing_email: string | null;
  email: string | null;
  phone: string | null;
} | null;

export type ProformaDocLine = {
  id: string;
  description: string;
  specification: string | null;
  unit: string;
  quantity: number;
  unit_price_usd_minor: number;
};

/** The client-facing document. USD only — no cost build-up, no RMB basis. */
export function ProformaDocument({
  proforma,
  client,
  lines,
  projectName,
}: {
  proforma: ProformaHeader;
  client: ProformaClient;
  lines: readonly ProformaDocLine[];
  projectName: string;
}) {
  const totals = rollUpProforma(
    lines.map((l) => ({ quantity: l.quantity, unitPriceRmbMinor: 0, unitPriceUsdMinor: l.unit_price_usd_minor })),
  );
  const issued = proforma.issued_at ? new Date(proforma.issued_at) : null;

  return (
    <div className="print-document bg-background p-8 text-sm text-foreground">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight">{UZA_ISSUER.legalName}</p>
          <p className="text-muted-foreground">{UZA_ISSUER.division}</p>
          <div className="mt-3 text-muted-foreground">
            {UZA_ISSUER.addressLines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p className="tabular">{UZA_ISSUER.phone}</p>
            <p>{UZA_ISSUER.email}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-semibold uppercase tracking-wide">Proforma Invoice</p>
          <p className="tabular mt-2 font-medium">{proforma.reference}</p>
          <p className="tabular text-muted-foreground">
            {issued ? `Issued ${issued.toLocaleDateString("en-GB")}` : "Draft — not yet issued"}
          </p>
          <p className="tabular text-muted-foreground">Valid {proforma.validity_days} days</p>
        </div>
      </header>

      <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Issued to</p>
          {client ? (
            <div className="mt-1">
              <p className="font-medium">{client.name}</p>
              {client.contact_name && <p>Attn: {client.contact_name}</p>}
              {client.address && <p className="text-muted-foreground">{client.address}</p>}
              {(client.city || client.country) && (
                <p className="text-muted-foreground">{[client.city, client.country].filter(Boolean).join(", ")}</p>
              )}
              {client.company_registration && (
                <p className="tabular text-muted-foreground">Reg. {client.company_registration}</p>
              )}
              {client.tin && <p className="tabular text-muted-foreground">TIN {client.tin}</p>}
              {(client.billing_email || client.email) && (
                <p className="text-muted-foreground">{client.billing_email ?? client.email}</p>
              )}
              {client.phone && <p className="tabular text-muted-foreground">{client.phone}</p>}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No client record is linked to this project yet — link one so the letterhead carries the registered
              company name, registration number and billing address.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Project</p>
          <p className="mt-1 font-medium">{projectName}</p>
          <p className="text-muted-foreground">{proforma.title}</p>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 font-medium">Unit</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 pr-3 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-border/60 align-top">
              <td className="py-2 pr-3">
                <span className="tabular text-muted-foreground">{i + 1}. </span>
                {l.description}
                {l.specification && <p className="text-muted-foreground">{l.specification}</p>}
              </td>
              <td className="py-2 pr-3">{englishUnit(l.unit)}</td>
              <td className="tabular py-2 pr-3 text-right">{formatQuantity(l.quantity)}</td>
              <td className="tabular py-2 pr-3 text-right">{formatMoney(l.unit_price_usd_minor, "USD")}</td>
              <td className="tabular py-2 text-right">
                {formatMoney(lineAmount(l.quantity, l.unit_price_usd_minor), "USD")}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-3 pr-3 text-right font-medium">
              Total
            </td>
            <td className="tabular py-3 text-right text-base font-semibold">
              {formatMoney(totals.totalUsdMinor, "USD")}
            </td>
          </tr>
        </tfoot>
      </table>

      <section className="mt-6 space-y-1 border-t border-border pt-4 text-muted-foreground">
        {proforma.incoterm && <p>Terms of delivery: {proforma.incoterm}</p>}
        {proforma.payment_terms && <p>Payment: {proforma.payment_terms}</p>}
        {proforma.lead_time_note && <p>Lead time: {proforma.lead_time_note}</p>}
        {proforma.notes && <p>{proforma.notes}</p>}
        <p>
          Production is released only after written approval of samples. This proforma is issued by{" "}
          {UZA_ISSUER.legalName}; no supplier issues commercial terms directly.
        </p>
      </section>

      <section className="mt-8 border-t border-border pt-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Signed for and on behalf of {UZA_ISSUER.legalName}
        </p>
        {proforma.signed_by_name ? (
          <div className="mt-2">
            <p className="font-display text-lg font-semibold tracking-tight">{proforma.signed_by_name}</p>
            {proforma.signed_by_title && <p className="text-muted-foreground">{proforma.signed_by_title}</p>}
            <p className="text-muted-foreground">{UZA_ISSUER.division}</p>
            <p className="tabular text-muted-foreground">
              Signed electronically
              {proforma.signed_at ? ` on ${new Date(proforma.signed_at).toLocaleDateString("en-GB")}` : ""} ·
              Reference {proforma.reference}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is a typed electronic signature. It identifies the authorised signatory and the date of
              signing; it is not a scanned handwritten signature.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Not yet signed — the authorised signatory's name, title and signing date will appear here once this
            proforma is signed and issued.
          </p>
        )}
      </section>
    </div>
  );
}

/** Helper for callers converting a typed major-unit USD figure. */
export function usdMinor(major: number): number {
  return toMinor(major, "USD");
}
