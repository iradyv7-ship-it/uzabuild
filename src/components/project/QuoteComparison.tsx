import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  FilePlus2,
  MessagesSquare,
  RefreshCw,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/DataState";
import { SupplierThread } from "@/components/supplier/SupplierThread";
import { useAuth } from "@/context/AuthContext";
import { PROFORMA_DEFAULTS } from "@/config/company";
import { categoryLabel } from "@/config/packages";
import { FX_FALLBACK_RMB_PER_USD, type CurrencyCode } from "@/config/policy";
import { formatMoney, toMajor, toMinor } from "@/lib/pricing";
import { englishUnit, proformaReference, rmbToUsdMinor } from "@/lib/proforma";
import { buildQuoteMatrix, parseSchedule, type CellFlag } from "@/lib/quote-compare";
import { readFactoryQuote } from "@/lib/quote-reader.functions";
import {
  setManufacturerStatus,
  type PackageManufacturer,
  type ProductPackage,
} from "@/services/packageService";
import {
  listLinesForQuotes,
  listPackageRfqs,
  listQuotes,
  openQuoteFile,
  quoteStatusLabel,
  refreshQuoteTotal,
  submitQuote,
  updateQuoteLine,
  decideQuote,
  type DecisionStatus,
  type FactoryQuote,
  type FactoryQuoteLine,
} from "@/services/quoteService";

const FLAG_LABELS: Record<CellFlag, string> = {
  missing: "Not quoted",
  no_price: "No price",
  qty_mismatch: "Qty differs",
  unit_mismatch: "Unit differs",
};

/** Keeps the shortlist row in step with the decision on the quote. */
const SHORTLIST_STATUS: Record<DecisionStatus, string> = {
  under_review: "quoted",
  shortlisted: "quoted",
  selected: "selected",
  rejected: "rejected",
};

function errorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return fallback;
}

/**
 * Factory quotes for one package, side by side.
 *
 * Staff only. Every quote is matched to the RFQ schedule it answers, prices
 * are compared on the UZA basis (6 RMB/USD), and the chosen quote becomes a
 * client proforma — which never carries the factory's name.
 */
export function QuoteComparison({
  pkg,
  projectId,
  manufacturers,
  supplierNames,
}: {
  pkg: ProductPackage;
  projectId: string;
  manufacturers: PackageManufacturer[];
  supplierNames: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const read = useServerFn(readFactoryQuote);
  const [adding, setAdding] = useState(false);
  const [openLines, setOpenLines] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const quotesKey = ["factory-quotes", pkg.id] as const;
  const quotes = useQuery({ queryKey: quotesKey, queryFn: () => listQuotes(pkg.id) });
  const quoteIds = (quotes.data ?? []).map((q) => q.id);
  const lines = useQuery({
    queryKey: ["factory-quote-lines", pkg.id, quoteIds.join(",")],
    queryFn: () => listLinesForQuotes(quoteIds),
    enabled: quoteIds.length > 0,
  });
  const rfqs = useQuery({
    queryKey: ["package-rfqs", pkg.id],
    queryFn: () => listPackageRfqs(pkg.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: quotesKey });
    void queryClient.invalidateQueries({ queryKey: ["factory-quote-lines", pkg.id] });
    void queryClient.invalidateQueries({ queryKey: ["package-manufacturers", projectId] });
  };

  const schedule = useMemo(() => parseSchedule(rfqs.data?.[0]?.schedule), [rfqs.data]);
  const nameOf = (supplierId: string) => supplierNames[supplierId] ?? "Manufacturer";
  const rfqSuppliers = new Set((rfqs.data ?? []).map((r) => r.supplier_id));

  const matrix = useMemo(
    () =>
      buildQuoteMatrix(
        schedule,
        (quotes.data ?? []).map((q) => ({
          quoteId: q.id,
          supplierId: q.supplier_id,
          supplierName: nameOf(q.supplier_id),
          status: q.status,
          currency: q.currency as CurrencyCode,
          leadTimeDays: q.lead_time_days,
          moqNote: q.moq_note,
          validUntil: q.valid_until,
          incoterm: q.incoterm,
          sampleAvailable: q.sample_available,
        })),
        (lines.data ?? []).map((l) => ({
          quoteId: l.quote_id,
          scheduleKey: l.schedule_key,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity === null ? null : Number(l.quantity),
          unitPriceMinor: l.unit_price_minor,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, quotes.data, lines.data, supplierNames],
  );

  const reread = useMutation({
    mutationFn: (quoteId: string) => read({ data: { quoteId } }),
    onSuccess: (r) => {
      toast.success(
        `${r.lines} line(s) read.${r.warnings.length ? ` ${r.warnings.length} point(s) to check.` : ""}`,
      );
      refresh();
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Could not read that quotation."));
      refresh();
    },
  });

  const decide = useMutation({
    mutationFn: async ({ quote, status }: { quote: FactoryQuote; status: DecisionStatus }) => {
      await decideQuote(quote.id, status);
      const row = manufacturers.find((m) => m.supplier_id === quote.supplier_id);
      if (row) await setManufacturerStatus(row.id, SHORTLIST_STATUS[status]);
    },
    onSuccess: (_d, { status }) => {
      toast.success(`Quote ${quoteStatusLabel(status).split(" · ")[0]!.toLowerCase()}.`);
      refresh();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not record that decision.")),
  });

  const startProforma = useMutation({
    mutationFn: async (quote: FactoryQuote) => {
      const currency = quote.currency as CurrencyCode;
      if (currency === "RWF") {
        throw new Error(
          "This quote is in RWF. Proformas are built from RMB or USD quotes — enter it in the Proforma tab.",
        );
      }
      const quoteLines = (lines.data ?? []).filter((l) => l.quote_id === quote.id);
      if (quoteLines.length === 0) throw new Error("This quote has no lines yet — read it first.");

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .select("client_id")
        .eq("id", projectId)
        .maybeSingle();
      if (pErr) throw pErr;
      const { count, error: cErr } = await supabase
        .from("proformas")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (cErr) throw cErr;

      const basis = FX_FALLBACK_RMB_PER_USD;
      const skipped: string[] = [];
      const payload = quoteLines
        .map((l, i) => {
          const sched = schedule.find((s) => s.item === l.schedule_key);
          const quantity = l.quantity !== null ? Number(l.quantity) : (sched?.quantity ?? null);
          if (quantity === null || l.unit_price_minor === null) {
            skipped.push(l.description);
            return null;
          }
          const rmbMinor =
            currency === "CNY"
              ? l.unit_price_minor
              : toMinor(toMajor(l.unit_price_minor, "USD") * basis, "CNY");
          const usdMinor = currency === "USD" ? l.unit_price_minor : rmbToUsdMinor(rmbMinor, basis);
          const original = l.specification?.match(/原文: (.*)$/)?.[1] ?? null;
          return {
            project_id: projectId,
            description: l.description,
            description_source: original,
            specification: l.specification?.replace(/\s*·?\s*原文: .*$/, "") || null,
            unit: englishUnit(l.unit ?? "pcs"),
            quantity,
            unit_price_rmb_minor: rmbMinor,
            unit_price_usd_minor: usdMinor,
            sort_order: i,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (payload.length === 0)
        throw new Error("No line on this quote has both a quantity and a price.");

      // Title from the package, never the factory: the client sees this document.
      const { data: header, error } = await supabase
        .from("proformas")
        .insert({
          project_id: projectId,
          client_id: project?.client_id ?? null,
          reference: proformaReference((count ?? 0) + 1),
          title: `${categoryLabel(pkg.category)} supply — ${pkg.package_code ?? "package"}`,
          fx_rmb_per_usd: basis,
          incoterm: PROFORMA_DEFAULTS.incoterm,
          payment_terms: PROFORMA_DEFAULTS.paymentTerms,
          lead_time_note: quote.lead_time_days
            ? `About ${quote.lead_time_days} days after order confirmation and sample approval.`
            : PROFORMA_DEFAULTS.leadTimeNote,
          validity_days: PROFORMA_DEFAULTS.validityDays,
          created_by: user?.id ?? null,
        })
        .select("id, reference")
        .single();
      if (error) throw error;
      const { error: lineError } = await supabase
        .from("proforma_lines")
        .insert(payload.map((p) => ({ ...p, proforma_id: header.id })));
      if (lineError) throw lineError;
      return { reference: header.reference, skipped };
    },
    onSuccess: ({ reference, skipped }) => {
      void queryClient.invalidateQueries({ queryKey: ["proformas", projectId] });
      toast.success(
        `Draft proforma ${reference} created at the UZA basis (${FX_FALLBACK_RMB_PER_USD} RMB/USD). Open the Proforma tab to check and issue it.` +
          (skipped.length
            ? ` ${skipped.length} line(s) without a quantity or price were left out.`
            : ""),
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not start the proforma.")),
  });

  const rows = quotes.data ?? [];
  const selected = rows.find((q) => q.status === "selected");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Factory quotes · 报价对比</CardTitle>
          <CardDescription>
            Each quote is matched to the RFQ schedule and compared on the UZA basis of{" "}
            {FX_FALLBACK_RMB_PER_USD} RMB per USD. Factories never see each other&apos;s quotes, and
            the client never sees any of them.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={() => setAdding(true)}
          disabled={manufacturers.length === 0}
        >
          <FilePlus2 className="size-4" aria-hidden /> Add a quote received by email
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Quotes a factory uploads in its workspace, or that you add here from an email, appear here and are compared line by line against the RFQ."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((q) => {
              const warnings = Array.isArray(q.parse_warnings)
                ? (q.parse_warnings as string[])
                : [];
              const mine = (lines.data ?? []).filter((l) => l.quote_id === q.id);
              const summary = matrix.suppliers.find((s) => s.quoteId === q.id);
              return (
                <li key={q.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {nameOf(q.supplier_id)}
                        <Badge variant={q.status === "selected" ? "default" : "secondary"}>
                          {quoteStatusLabel(q.status)}
                        </Badge>
                        {q.submitted_side === "uza" && (
                          <Badge variant="outline">Entered by UZA</Badge>
                        )}
                        {summary?.cheapestOverall && (
                          <Badge className="gap-1">
                            <Trophy className="size-3" aria-hidden /> Lowest complete
                          </Badge>
                        )}
                        {summary?.fastest && (
                          <Badge variant="outline" className="gap-1">
                            <Zap className="size-3" aria-hidden /> Fastest
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          q.total_minor !== null
                            ? formatMoney(q.total_minor, q.currency as CurrencyCode)
                            : "No total yet",
                          summary && q.currency !== "USD" && summary.totalUsdMinor > 0
                            ? `≈ ${formatMoney(summary.totalUsdMinor, "USD")} at basis`
                            : null,
                          summary ? `${summary.coveragePct}% of schedule priced` : null,
                          q.lead_time_days !== null ? `${q.lead_time_days} days` : null,
                          q.incoterm,
                          q.valid_until ? `valid to ${q.valid_until}` : null,
                          q.sample_available === true ? "samples available" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {q.moq_note && (
                        <p className="text-xs text-muted-foreground">MOQ: {q.moq_note}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {q.attachment_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void openQuoteFile(q.attachment_path!, q.file_name ?? "quote").catch(
                              (e: unknown) =>
                                toast.error(errorMessage(e, "Could not open the file.")),
                            )
                          }
                        >
                          <Download className="size-4" aria-hidden />
                          <span className="sr-only">Open quotation file</span>
                        </Button>
                      )}
                      {q.attachment_path &&
                        !["selected", "rejected", "withdrawn"].includes(q.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reread.isPending}
                            onClick={() => reread.mutate(q.id)}
                          >
                            <RefreshCw className="size-4" aria-hidden />
                            {reread.isPending && reread.variables === q.id
                              ? "Reading…"
                              : q.parsed_at
                                ? "Read again"
                                : "Read quote"}
                          </Button>
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={openLines === q.id}
                        onClick={() => setOpenLines(openLines === q.id ? null : q.id)}
                      >
                        Lines ({mine.length})
                        {openLines === q.id ? (
                          <ChevronUp className="size-4" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden />
                        )}
                      </Button>
                      {rfqSuppliers.has(q.supplier_id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-expanded={openThread === q.supplier_id}
                          onClick={() =>
                            setOpenThread(openThread === q.supplier_id ? null : q.supplier_id)
                          }
                        >
                          <MessagesSquare className="size-4" aria-hidden /> Messages
                        </Button>
                      )}
                    </div>
                  </div>

                  {warnings.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                      {warnings.map((w) => (
                        <li key={w} className="flex gap-2">
                          <AlertTriangle
                            className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                            aria-hidden
                          />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}

                  {q.status !== "withdrawn" && (
                    <div className="flex flex-wrap gap-2">
                      {(["under_review", "shortlisted", "selected", "rejected"] as const).map(
                        (s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant={q.status === s ? "default" : "outline"}
                            disabled={decide.isPending || q.status === s}
                            onClick={() => decide.mutate({ quote: q, status: s })}
                          >
                            {s === "under_review"
                              ? "Review"
                              : s === "shortlisted"
                                ? "Shortlist"
                                : s === "selected"
                                  ? "Select"
                                  : "Reject"}
                          </Button>
                        ),
                      )}
                      {q.status === "selected" && (
                        <Button
                          size="sm"
                          disabled={startProforma.isPending}
                          onClick={() => startProforma.mutate(q)}
                        >
                          {startProforma.isPending
                            ? "Creating…"
                            : "Start client proforma from this quote"}
                        </Button>
                      )}
                    </div>
                  )}

                  {openLines === q.id && (
                    <QuoteLinesEditor
                      quote={q}
                      lines={mine}
                      scheduleItems={schedule.map((s) => s.item)}
                      onSaved={refresh}
                    />
                  )}
                  {openThread === q.supplier_id && (
                    <div className="rounded-md border p-3">
                      <SupplierThread packageId={pkg.id} supplierId={q.supplier_id} side="uza" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {schedule.length > 0 && matrix.suppliers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Side by side · 逐项对比{" "}
              <span className="font-normal text-muted-foreground">
                (unit prices; cheapest per item highlighted, compared in USD at the UZA basis)
              </span>
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Item asked</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {matrix.suppliers.map((s) => (
                      <TableHead key={s.quoteId} className="min-w-36 text-right">
                        {s.supplierName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.rows.map((r) => (
                    <TableRow key={r.item}>
                      <TableCell className="text-sm">
                        <span className="tabular text-muted-foreground">{r.item}.</span>{" "}
                        {r.description}
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">
                        {r.quantity} {r.unit}
                      </TableCell>
                      {matrix.suppliers.map((s) => {
                        const c = r.cells[s.quoteId];
                        return (
                          <TableCell
                            key={s.quoteId}
                            className={`tabular text-right text-sm ${c?.cheapest ? "bg-primary/10 font-semibold" : ""}`}
                          >
                            {c && c.unitPriceMinor !== null
                              ? formatMoney(c.unitPriceMinor, s.currency)
                              : "—"}
                            {c && c.flags.length > 0 && (
                              <span className="block text-xs font-normal text-amber-700 dark:text-amber-400">
                                {c.flags.map((f) => FLAG_LABELS[f]).join(", ")}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">Total quoted (USD at basis)</TableCell>
                    <TableCell />
                    {matrix.suppliers.map((s) => (
                      <TableCell
                        key={s.quoteId}
                        className={`tabular text-right font-semibold ${s.cheapestOverall ? "bg-primary/10" : ""}`}
                      >
                        {formatMoney(s.totalUsdMinor, "USD")}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {s.coveragePct}% priced
                          {s.extras.length ? ` · +${s.extras.length} extra` : ""}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {selected && (
          <p className="text-sm text-muted-foreground">
            Selected: {nameOf(selected.supplier_id)}. The client proforma built from it is titled by
            package and never names the factory.
          </p>
        )}
      </CardContent>

      {adding && (
        <AddQuoteDialog
          pkg={pkg}
          projectId={projectId}
          manufacturers={manufacturers}
          nameOf={nameOf}
          onClose={() => setAdding(false)}
          onAdded={(quoteId, hasFile) => {
            setAdding(false);
            refresh();
            if (hasFile) reread.mutate(quoteId);
          }}
        />
      )}
    </Card>
  );
}

function QuoteLinesEditor({
  quote,
  lines,
  scheduleItems,
  onSaved,
}: {
  quote: FactoryQuote;
  lines: FactoryQuoteLine[];
  scheduleItems: string[];
  onSaved: () => void;
}) {
  const currency = quote.currency as CurrencyCode;
  const save = useMutation({
    mutationFn: async (v: { id: string; quantity: string; price: string }) => {
      const quantity = v.quantity.trim() === "" ? null : Number(v.quantity);
      const price = v.price.trim() === "" ? null : Number(v.price);
      if (
        (quantity !== null && !Number.isFinite(quantity)) ||
        (price !== null && !Number.isFinite(price))
      ) {
        throw new Error("Enter numbers only.");
      }
      await updateQuoteLine(v.id, {
        quantity,
        unit_price_minor: price === null ? null : toMinor(price, currency),
      });
      await refreshQuoteTotal(quote.id);
    },
    onSuccess: onSaved,
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save that line.")),
  });

  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">No lines yet — read the quote first.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFQ item</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="w-28">Qty</TableHead>
            <TableHead className="w-32">Unit price ({currency})</TableHead>
            <TableHead>Read from</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="tabular text-sm">
                {l.schedule_key && scheduleItems.includes(l.schedule_key)
                  ? l.schedule_key
                  : "Extra"}
              </TableCell>
              <TableCell className="text-sm">
                {l.description}
                {l.specification && (
                  <span className="block text-xs text-muted-foreground">{l.specification}</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{l.unit ?? "—"}</TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  defaultValue={l.quantity === null ? "" : String(Number(l.quantity))}
                  onBlur={(e) =>
                    e.target.value !== (l.quantity === null ? "" : String(Number(l.quantity))) &&
                    save.mutate({
                      id: l.id,
                      quantity: e.target.value,
                      price:
                        l.unit_price_minor === null
                          ? ""
                          : String(toMajor(l.unit_price_minor, currency)),
                    })
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  defaultValue={
                    l.unit_price_minor === null ? "" : String(toMajor(l.unit_price_minor, currency))
                  }
                  onBlur={(e) =>
                    e.target.value !==
                      (l.unit_price_minor === null
                        ? ""
                        : String(toMajor(l.unit_price_minor, currency))) &&
                    save.mutate({
                      id: l.id,
                      quantity: l.quantity === null ? "" : String(Number(l.quantity)),
                      price: e.target.value,
                    })
                  }
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{l.source_ref ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AddQuoteDialog({
  pkg,
  projectId,
  manufacturers,
  nameOf,
  onClose,
  onAdded,
}: {
  pkg: ProductPackage;
  projectId: string;
  manufacturers: PackageManufacturer[];
  nameOf: (supplierId: string) => string;
  onClose: () => void;
  onAdded: (quoteId: string, hasFile: boolean) => void;
}) {
  const [supplierId, setSupplierId] = useState(manufacturers[0]?.supplier_id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<"CNY" | "USD" | "RWF">("CNY");
  const [lead, setLead] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: () =>
      submitQuote({
        packageId: pkg.id,
        projectId,
        supplierId,
        file,
        currency,
        incoterm,
        leadTimeDays: lead.trim() ? Number(lead) : null,
        validUntil: validUntil || null,
        notes,
      }),
    onSuccess: ({ quoteId }) => {
      toast.success(
        file
          ? "Quote added — reading it now."
          : "Quote added. Add its lines by reading a file later.",
      );
      onAdded(quoteId, Boolean(file));
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not add the quote.")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a quote received outside the platform</DialogTitle>
          <DialogDescription>
            For a quotation that arrived by email or WeChat. Upload the PDF, Excel sheet or a photo;
            it is read and matched to the RFQ schedule automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-quote"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <div className="space-y-1">
            <Label>Factory</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the factory" />
              </SelectTrigger>
              <SelectContent>
                {manufacturers.map((m) => (
                  <SelectItem key={m.supplier_id} value={m.supplier_id}>
                    {nameOf(m.supplier_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-file">Quotation file</Label>
            <Input
              id="quote-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.ods,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as "CNY" | "USD" | "RWF")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">RMB (CNY)</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="RWF">RWF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-lead">Lead time (days)</Label>
              <Input
                id="quote-lead"
                inputMode="numeric"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-incoterm">Incoterm</Label>
              <Input
                id="quote-incoterm"
                placeholder="FOB Foshan"
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-valid">Valid until</Label>
              <Input
                id="quote-valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-notes">Notes (the factory can see these on its own quote)</Label>
            <Textarea
              id="quote-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-quote" disabled={add.isPending || !supplierId}>
            {add.isPending ? "Adding…" : "Add quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
