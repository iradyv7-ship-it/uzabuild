import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Mail, Plus, Printer, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QueryState, EmptyState } from "@/components/DataState";
import { PROFORMA_DEFAULTS, UZA_ISSUER } from "@/config/company";
import { RMB_PER_USD } from "@/config/discovery";
import { formatMoney, lineAmount, toMinor, toMajor } from "@/lib/pricing";
import { proformaReference, rmbToUsdMinor, rollUpProforma } from "@/lib/proforma";
import { parseFactoryQuote } from "@/lib/proforma.functions";
import { buildProformaPdf } from "@/lib/proforma-pdf.functions";
import { getUsdRmbRate } from "@/lib/fx.functions";
import { FX_MAX_AGE_HOURS } from "@/config/policy";
import { ProformaDocument } from "@/components/project/ProformaDocument";
import { useAuth } from "@/context/AuthContext";

type DraftLine = {
  description: string;
  original_description: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_price_rmb: number;
};

export function ProformaPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const queryClient = useQueryClient();
  const { user, fullName } = useAuth();
  const readQuote = useServerFn(parseFactoryQuote);
  const makePdf = useServerFn(buildProformaPdf);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [title, setTitle] = useState("");
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [quoteText, setQuoteText] = useState("");
  const [draft, setDraft] = useState<DraftLine[]>([]);

  const fetchRate = useServerFn(getUsdRmbRate);
  const fx = useQuery({
    queryKey: ["fx-usd-rmb"],
    queryFn: () => fetchRate({}),
    staleTime: FX_MAX_AGE_HOURS * 60 * 60 * 1000,
  });
  const liveRate = fx.data?.rate ?? RMB_PER_USD;
  const rate = rateOverride ?? String(liveRate);

  const project = useQuery({
    queryKey: ["project-client", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("client_id, client_name")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const client = useQuery({
    queryKey: ["client-record", project.data?.client_id],
    enabled: Boolean(project.data?.client_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "name, contact_name, company_registration, tin, address, city, country, billing_email, email, phone",
        )
        .eq("id", project.data?.client_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const proformas = useQuery({
    queryKey: ["proformas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proformas")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const active = activeId ?? proformas.data?.[0]?.id ?? null;
  const activeProforma = proformas.data?.find((p) => p.id === active) ?? null;

  const lines = useQuery({
    queryKey: ["proforma-lines", active],
    enabled: Boolean(active),
    queryFn: async () => {
      // Internal read: includes the factory RMB basis, which the database hides
      // from ordinary reads so a client seat can never fetch it.
      const { data, error } = await supabase.rpc("internal_proforma_lines", {
        _proforma_id: active ?? "",
      });
      if (error) throw error;
      return data;
    },
  });

  const totals = rollUpProforma(
    (lines.data ?? []).map((l) => ({
      quantity: l.quantity,
      unitPriceRmbMinor: l.unit_price_rmb_minor,
      unitPriceUsdMinor: l.unit_price_usd_minor,
    })),
  );

  const parse = useMutation({
    mutationFn: async () => readQuote({ data: { text: quoteText } }),
    onSuccess: (result) => {
      setDraft(result.lines);
      toast.success(`${result.lines.length} draft line(s) read. Check every one before issuing.`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not read that quotation."),
  });

  const create = useMutation({
    mutationFn: async () => {
      const fxRate = Number(rate) > 0 ? Number(rate) : liveRate;
      const reference = proformaReference((proformas.data?.length ?? 0) + 1);
      const { data: header, error } = await supabase
        .from("proformas")
        .insert({
          project_id: projectId,
          client_id: project.data?.client_id ?? null,
          reference,
          title: title.trim() || "Supply proforma",
          fx_rmb_per_usd: fxRate,
          incoterm: PROFORMA_DEFAULTS.incoterm,
          payment_terms: PROFORMA_DEFAULTS.paymentTerms,
          lead_time_note: PROFORMA_DEFAULTS.leadTimeNote,
          validity_days: PROFORMA_DEFAULTS.validityDays,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (draft.length > 0) {
        const payload = draft.map((l, i) => {
          const rmbMinor = toMinor(l.unit_price_rmb, "CNY");
          return {
            proforma_id: header.id,
            project_id: projectId,
            description: l.description,
            description_source: l.original_description || null,
            specification: l.specification || null,
            unit: l.unit || "pcs",
            quantity: l.quantity,
            unit_price_rmb_minor: rmbMinor,
            unit_price_usd_minor: rmbToUsdMinor(rmbMinor, fxRate),
            sort_order: i,
          };
        });
        const { error: lineError } = await supabase.from("proforma_lines").insert(payload);
        if (lineError) throw lineError;
      }
      return header.id;
    },
    onSuccess: (id) => {
      setCreateOpen(false);
      setTitle("");
      setQuoteText("");
      setDraft([]);
      setActiveId(id);
      void queryClient.invalidateQueries({ queryKey: ["proformas", projectId] });
      toast.success("Draft proforma created.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not create the proforma."),
  });

  const updateLine = useMutation({
    mutationFn: async ({
      id,
      quantity,
      rmbMajor,
    }: {
      id: string;
      quantity: number;
      rmbMajor: number;
    }) => {
      const fx = activeProforma?.fx_rmb_per_usd ?? RMB_PER_USD;
      const rmbMinor = toMinor(rmbMajor, "CNY");
      const { error } = await supabase
        .from("proforma_lines")
        .update({
          quantity,
          unit_price_rmb_minor: rmbMinor,
          unit_price_usd_minor: rmbToUsdMinor(rmbMinor, fx),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["proforma-lines", active] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save that line."),
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proforma_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["proforma-lines", active] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not remove that line."),
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const name = signerName.trim();
      const jobTitle = signerTitle.trim();
      if (name === "" || jobTitle === "") {
        throw new Error("Enter the signatory's full name and job title before signing.");
      }
      const { error } = await supabase
        .from("proformas")
        .update({
          status: "issued",
          issued_at: new Date().toISOString(),
          signed_by_name: name,
          signed_by_title: jobTitle,
          signed_at: new Date().toISOString(),
        })
        .eq("id", active);
      if (error) throw error;
    },
    onSuccess: () => {
      setSignOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["proformas", projectId] });
      toast.success("Proforma signed and issued. The document now carries the signature block.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not issue the proforma."),
  });

  /** Turn a base64 PDF from the server into a real file the browser saves. */
  function saveFile(fileName: string, base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const pdf = useMutation({
    mutationFn: async (intent: "download" | "email") => {
      if (!active) throw new Error("Select a proforma first.");
      const file = await makePdf({ data: { proformaId: active } });
      saveFile(file.fileName, file.base64);
      return { file, intent };
    },
    onSuccess: ({ file, intent }) => {
      if (intent === "download") {
        toast.success(`${file.fileName} saved. Attach it to your email to the client.`);
        return;
      }
      const greeting = file.contactName ? `Dear ${file.contactName},` : "Dear Sir/Madam,";
      const body = [
        greeting,
        "",
        `Please find attached proforma invoice ${file.reference} from ${UZA_ISSUER.legalName} for ${file.projectName}.`,
        "",
        "The attached document carries our full commercial terms. Please confirm if you would like us to proceed.",
        "",
        "Kind regards,",
        UZA_ISSUER.division,
        `${UZA_ISSUER.phone} · ${UZA_ISSUER.email}`,
      ].join("\n");
      const mailto = `mailto:${file.clientEmail ?? ""}?subject=${encodeURIComponent(
        `${UZA_ISSUER.legalName} — Proforma ${file.reference}`,
      )}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      toast.success(
        file.clientEmail
          ? `${file.fileName} saved and an email to ${file.clientEmail} opened — attach the saved file before sending.`
          : `${file.fileName} saved. The client record has no email address, so add one in the draft.`,
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not build the PDF."),
  });

  const reprice = useMutation({
    mutationFn: async () => {
      if (!activeProforma) return { before: 0, after: 0 };
      const fresh = await fetchRate({});
      const before = totals.totalUsdMinor;
      const { error } = await supabase
        .from("proformas")
        .update({ fx_rmb_per_usd: fresh.rate })
        .eq("id", activeProforma.id);
      if (error) throw error;
      for (const l of lines.data ?? []) {
        const { error: lineError } = await supabase
          .from("proforma_lines")
          .update({ unit_price_usd_minor: rmbToUsdMinor(l.unit_price_rmb_minor, fresh.rate) })
          .eq("id", l.id);
        if (lineError) throw lineError;
      }
      const after = (lines.data ?? []).reduce(
        (sum, l) => sum + lineAmount(l.quantity, rmbToUsdMinor(l.unit_price_rmb_minor, fresh.rate)),
        0,
      );
      return { before, after, rate: fresh.rate };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["fx-usd-rmb"] });
      void queryClient.invalidateQueries({ queryKey: ["proformas", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["proforma-lines", active] });
      const delta = result.after - result.before;
      toast.success(
        delta === 0
          ? "Repriced — today's rate gives the same client total."
          : `Repriced. Client total ${delta > 0 ? "up" : "down"} by ${formatMoney(Math.abs(delta), "USD")}.`,
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not reprice this proforma."),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Proformas</CardTitle>
            <CardDescription>Issued by UZA only, never by a factory.</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 size-4" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New proforma from a factory quotation</DialogTitle>
                <DialogDescription>
                  Paste the quotation exactly as the factory sent it — Chinese or English. Every
                  line comes back as a draft in English with its original wording kept, for you to
                  check before issuing.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="pf-title">Title</Label>
                    <Input
                      id="pf-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Phase 1 — guest room finishes"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pf-rate">RMB per USD</Label>
                    <Input
                      id="pf-rate"
                      type="number"
                      step="0.01"
                      value={rate}
                      onChange={(e) => setRateOverride(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {fx.isLoading
                        ? "Fetching today's published rate…"
                        : fx.data
                          ? `${fx.data.live ? "Published rate" : "Last known rate"} of ${fx.data.asOf} from ${fx.data.source}. It is pinned onto this proforma.`
                          : "Published rate unavailable — this is an internal working rate."}
                    </p>
                    {fx.data?.note && <p className="text-xs text-destructive">{fx.data.note}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-quote">Factory quotation</Label>
                  <Textarea
                    id="pf-quote"
                    rows={8}
                    value={quoteText}
                    onChange={(e) => setQuoteText(e.target.value)}
                    placeholder="Paste the quotation text here"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => parse.mutate()}
                  disabled={parse.isPending || quoteText.trim() === ""}
                >
                  <Sparkles className="mr-1 size-4" />
                  {parse.isPending ? "Reading the quotation…" : "Read and translate the quotation"}
                </Button>

                {draft.length > 0 && (
                  <div className="rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <p className="text-sm font-medium">{draft.length} draft line(s)</p>
                      <Badge variant="outline">Draft — machine read, not confirmed</Badge>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item (English)</TableHead>
                            <TableHead>As written</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit RMB</TableHead>
                            <TableHead className="text-right">Unit USD</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {draft.map((l, i) => (
                            <TableRow key={`${l.description}-${i}`}>
                              <TableCell>
                                {l.description}
                                {l.specification && (
                                  <p className="text-xs text-muted-foreground">{l.specification}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {l.original_description || "—"}
                              </TableCell>
                              <TableCell className="tabular text-right">{l.quantity}</TableCell>
                              <TableCell className="tabular text-right">
                                {formatMoney(toMinor(l.unit_price_rmb, "CNY"), "CNY")}
                              </TableCell>
                              <TableCell className="tabular text-right">
                                {formatMoney(
                                  rmbToUsdMinor(
                                    toMinor(l.unit_price_rmb, "CNY"),
                                    Number(rate) || RMB_PER_USD,
                                  ),
                                  "USD",
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                {quoteText.trim() !== "" && draft.length === 0 && (
                  <p className="text-xs text-muted-foreground sm:mr-auto">
                    Read the pasted quotation first — otherwise the proforma would be created with
                    no lines.
                  </p>
                )}
                <Button
                  onClick={() => create.mutate()}
                  disabled={
                    create.isPending ||
                    parse.isPending ||
                    (quoteText.trim() !== "" && draft.length === 0)
                  }
                >
                  {create.isPending ? "Creating…" : "Create draft proforma"}
                </Button>
              </DialogFooter>

            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={proformas.isLoading}
            error={proformas.error}
            isEmpty={(proformas.data?.length ?? 0) === 0}
            onRetry={() => void proformas.refetch()}
            empty={
              <EmptyState
                title="No proforma yet"
                description="Proformas you build from a factory quotation will be listed here, newest first, with their reference and status."
              />
            }
          >
            <ul className="space-y-2">
              {(proformas.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                      p.id === active
                        ? "border-primary bg-accent"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <span className="tabular block font-medium">{p.reference}</span>
                    <span className="block text-muted-foreground">{p.title}</span>
                    <Badge variant={p.status === "issued" ? "default" : "outline"} className="mt-1">
                      {p.status === "issued" ? "Issued" : "Draft"}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              {activeProforma
                ? `${activeProforma.reference} — ${activeProforma.title}`
                : "Proforma"}
            </CardTitle>
            <CardDescription>
              {activeProforma
                ? `Priced at ${activeProforma.fx_rmb_per_usd} RMB per USD, pinned to this document. Today's published rate is ${fx.data ? fx.data.rate : "…"}.`
                : "Select or create a proforma."}
            </CardDescription>
          </div>
          {activeProforma && (
            <div className="flex gap-2">
              <Dialog open={printOpen} onOpenChange={setPrintOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FileText className="mr-1 size-4" /> Client document
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
                  <DialogHeader className="print-hidden flex-row items-center justify-between gap-3 space-y-0 border-b border-border p-4">
                    <DialogTitle>Client document</DialogTitle>
                    <Button size="sm" onClick={() => window.print()}>
                      <Printer className="mr-1 size-4" /> Print / save as PDF
                    </Button>
                  </DialogHeader>
                  <ProformaDocument
                    proforma={activeProforma}
                    client={client.data ?? null}
                    lines={lines.data ?? []}
                    projectName={projectName}
                  />
                </DialogContent>
              </Dialog>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pdf.mutate("download")}
                disabled={pdf.isPending}
              >
                <Download className="mr-1 size-4" />
                {pdf.isPending ? "Preparing…" : "Download PDF"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pdf.mutate("email")}
                disabled={pdf.isPending}
              >
                <Mail className="mr-1 size-4" /> Email to client
              </Button>
              {activeProforma.status !== "issued" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reprice.mutate()}
                  disabled={reprice.isPending}
                >
                  <RefreshCw className="mr-1 size-4" />
                  {reprice.isPending ? "Repricing…" : "Reprice at today's rate"}
                </Button>
              )}
              {(activeProforma.status !== "issued" || !activeProforma.signed_by_name) && (
                <Dialog
                  open={signOpen}
                  onOpenChange={(open) => {
                    setSignOpen(open);
                    if (open && signerName.trim() === "") setSignerName(fullName);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Send className="mr-1 size-4" />
                      {activeProforma.status === "issued" ? "Sign" : "Sign & issue"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Sign and issue this proforma</DialogTitle>
                      <DialogDescription>
                        The name and title you enter are printed on the document as a typed electronic
                        signature, with the signing date and the proforma reference. It is not a scanned
                        handwritten signature and the document says so.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="signer-name">Full name of signatory</Label>
                        <Input
                          id="signer-name"
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                          placeholder="Full name"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="signer-title">Job title</Label>
                        <Input
                          id="signer-title"
                          value={signerTitle}
                          onChange={(e) => setSignerTitle(e.target.value)}
                          placeholder="e.g. Procurement Manager"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Signing also issues the proforma: it is dated, locked to today's exchange basis and can
                        be sent to the client.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
                        {issue.isPending ? "Signing…" : "Sign and issue"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!activeProforma ? (
            <EmptyState
              title="Nothing selected"
              description="Create a proforma from a pasted factory quotation; the lines, RMB basis and USD price will appear here."
            />
          ) : (
            <QueryState
              isLoading={lines.isLoading}
              error={lines.error}
              isEmpty={(lines.data?.length ?? 0) === 0}
              onRetry={() => void lines.refetch()}
              empty={
                <EmptyState
                  title="No lines on this proforma"
                  description="Read a factory quotation into a new proforma to populate its lines."
                />
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit RMB</TableHead>
                      <TableHead className="text-right">Unit USD</TableHead>
                      <TableHead className="text-right">Amount USD</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lines.data ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="min-w-56">
                          {l.description}
                          {l.specification && (
                            <p className="text-xs text-muted-foreground">{l.specification}</p>
                          )}
                          {l.description_source && (
                            <p className="text-xs text-muted-foreground">
                              As written: {l.description_source}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{l.unit}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="ml-auto w-24 text-right"
                            type="number"
                            step="0.01"
                            defaultValue={l.quantity}
                            onBlur={(e) =>
                              updateLine.mutate({
                                id: l.id,
                                quantity: Number(e.target.value) || 0,
                                rmbMajor: toMajor(l.unit_price_rmb_minor, "CNY"),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="ml-auto w-28 text-right"
                            type="number"
                            step="0.01"
                            defaultValue={toMajor(l.unit_price_rmb_minor, "CNY")}
                            onBlur={(e) =>
                              updateLine.mutate({
                                id: l.id,
                                quantity: l.quantity,
                                rmbMajor: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatMoney(l.unit_price_usd_minor, "USD")}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatMoney(lineAmount(l.quantity, l.unit_price_usd_minor), "USD")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remove line"
                            onClick={() => removeLine.mutate(l.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap justify-end gap-6 border-t border-border pt-4 text-sm">
                <div className="text-right">
                  <p className="text-muted-foreground">Factory basis</p>
                  <p className="tabular font-medium">{formatMoney(totals.totalRmbMinor, "CNY")}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">Client total</p>
                  <p className="tabular text-lg font-semibold">
                    {formatMoney(totals.totalUsdMinor, "USD")}
                  </p>
                </div>
              </div>
            </QueryState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
