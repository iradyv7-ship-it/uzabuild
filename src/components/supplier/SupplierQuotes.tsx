import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { QueryState, EmptyState } from "@/components/DataState";
import {
  QUOTE_STATUS_LABELS,
  listQuoteLines,
  listQuotes,
  openQuoteFile,
  submitQuote,
  updateQuoteLine,
  withdrawQuote,
  type FactoryQuote,
  type FactoryQuoteLine,
} from "@/services/quoteService";
import { readFactoryQuote } from "@/lib/quote-reader.functions";
import { fromMinorUnits, toMinorUnits } from "@/lib/supplier-money";

const ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.ods,.csv,.docx,.png,.jpg,.jpeg,.webp";
const CURRENCIES = ["CNY", "USD", "RWF"] as const;
const INCOTERMS = ["FOB", "EXW", "CIF", "CFR", "DAP"] as const;
const NONE = "__none__";
const EDITABLE = new Set(["submitted", "parsed"]);

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "selected") return "default";
  if (status === "rejected" || status === "withdrawn") return "destructive";
  if (status === "shortlisted" || status === "under_review") return "secondary";
  return "outline";
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return "Something went wrong · 出错了";
}

type Form = {
  file: File | null;
  currency: (typeof CURRENCIES)[number];
  incoterm: string;
  leadTimeDays: string;
  moqNote: string;
  validUntil: string;
  paymentTerms: string;
  sample: string;
  notes: string;
};

const EMPTY: Form = {
  file: null,
  currency: "CNY",
  incoterm: "FOB",
  leadTimeDays: "",
  moqNote: "",
  validUntil: "",
  paymentTerms: "",
  sample: NONE,
  notes: "",
};

/**
 * The factory's side of quoting one package: send a quotation (any common
 * format — the reader turns it into lines), correct the lines while UZA has
 * not yet reviewed it, follow its status, or withdraw it.
 */
export function SupplierQuotes({
  packageId,
  projectId,
  supplierId,
  open,
}: {
  packageId: string;
  projectId: string;
  supplierId: string;
  /** False once UZA has closed the package; the form is hidden then. */
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const read = useServerFn(readFactoryQuote);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [warnings, setWarnings] = useState<string[]>([]);
  const key = ["factory-quotes", packageId] as const;

  const quotes = useQuery({ queryKey: key, queryFn: () => listQuotes(packageId) });

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.file) throw new Error("Attach your quotation file · 请上传报价文件");
      const lead = form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays);
      if (lead !== null && (!Number.isInteger(lead) || lead < 0)) {
        throw new Error("Lead time must be a number of days · 交期请填写天数");
      }
      const { quoteId } = await submitQuote({
        packageId,
        projectId,
        supplierId,
        file: form.file,
        currency: form.currency,
        incoterm: form.incoterm === NONE ? null : form.incoterm,
        leadTimeDays: lead,
        moqNote: form.moqNote.trim() || null,
        validUntil: form.validUntil || null,
        paymentTerms: form.paymentTerms.trim() || null,
        sampleAvailable: form.sample === NONE ? null : form.sample === "yes",
        notes: form.notes.trim() || null,
      });
      // Reading can fail (unreadable scan, busy model) without losing the quote.
      try {
        return await read({ data: { quoteId } });
      } catch (e) {
        return {
          lines: 0,
          warnings: [
            `Your file was received but could not be read automatically: ${errorText(e)} · 文件已收到，但无法自动识别，UZA 将人工查看。`,
          ],
          totalMinor: null,
        };
      }
    },
    onSuccess: (result) => {
      toast.success(
        result.lines > 0
          ? `Quotation received — ${result.lines} line(s) read. Please check them below · 报价已收到，请核对下方明细`
          : "Quotation received · 报价已收到",
      );
      setWarnings(result.warnings);
      setForm(EMPTY);
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: unknown) => toast.error(errorText(e)),
  });

  const withdraw = useMutation({
    mutationFn: withdrawQuote,
    onSuccess: () => {
      toast.success("Quotation withdrawn · 报价已撤回");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: unknown) => toast.error(errorText(e)),
  });

  const rows = quotes.data ?? [];

  return (
    <div className="space-y-6">
      {open && (
        <form
          className="space-y-4 rounded-md border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="quote-file">Quotation file · 报价文件</Label>
            <Input
              id="quote-file"
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
            />
            <p className="text-xs text-muted-foreground">
              PDF, Excel, CSV, Word or a photo · 支持 PDF、Excel、CSV、Word 或照片
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Currency · 币种</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v as Form["currency"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Incoterm · 贸易条款</Label>
              <Select
                value={form.incoterm}
                onValueChange={(v) => setForm({ ...form, incoterm: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not stated · 未注明</SelectItem>
                  {INCOTERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-lead">Lead time (days) · 交期（天）</Label>
              <Input
                id="quote-lead"
                inputMode="numeric"
                className="tabular"
                value={form.leadTimeDays}
                onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-moq">MOQ · 最小起订量</Label>
              <Input
                id="quote-moq"
                value={form.moqNote}
                onChange={(e) => setForm({ ...form, moqNote: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-valid">Valid until · 有效期至</Label>
              <Input
                id="quote-valid"
                type="date"
                className="tabular"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Samples available · 可提供样品</Label>
              <Select value={form.sample} onValueChange={(v) => setForm({ ...form, sample: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not stated · 未注明</SelectItem>
                  <SelectItem value="yes">Yes · 是</SelectItem>
                  <SelectItem value="no">No · 否</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-payment">Payment terms · 付款条件</Label>
            <Input
              id="quote-payment"
              placeholder="e.g. 30% deposit, 70% before shipment · 例如：30% 定金，70% 发货前付清"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-notes">Notes · 备注</Label>
            <Textarea
              id="quote-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={submit.isPending || !form.file}>
            <FileUp className="size-4" aria-hidden />
            {submit.isPending
              ? "Sending and reading… · 正在提交并识别…"
              : "Submit quotation · 提交报价"}
          </Button>
        </form>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <QueryState
        isLoading={quotes.isLoading}
        error={quotes.error}
        isEmpty={rows.length === 0}
        onRetry={() => void quotes.refetch()}
        empty={
          <EmptyState
            title="No quotation sent yet · 尚未提交报价"
            description="Your quotations for this request appear here with their status · 您针对此询价提交的报价及状态将显示在这里"
          />
        }
      >
        <ul className="space-y-4">
          {rows.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              withdrawing={withdraw.isPending}
              onWithdraw={() => withdraw.mutate(q.id)}
            />
          ))}
        </ul>
      </QueryState>
    </div>
  );
}

function QuoteCard({
  quote,
  withdrawing,
  onWithdraw,
}: {
  quote: FactoryQuote;
  withdrawing: boolean;
  onWithdraw: () => void;
}) {
  const editable = EDITABLE.has(quote.status);
  const lines = useQuery({
    queryKey: ["factory-quote-lines", quote.id],
    queryFn: () => listQuoteLines(quote.id),
  });

  return (
    <li className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {quote.file_name ?? "Quotation · 报价"}{" "}
            <Badge variant={statusVariant(quote.status)} className="ml-1">
              {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
            </Badge>
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {new Date(quote.created_at).toLocaleDateString("zh-CN")} · {quote.currency}
            {quote.incoterm ? ` · ${quote.incoterm}` : ""}
            {quote.lead_time_days !== null ? ` · ${quote.lead_time_days} days · 天` : ""}
            {quote.total_minor !== null
              ? ` · Total · 合计 ${fromMinorUnits(quote.total_minor, quote.currency)}`
              : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {quote.attachment_path && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void openQuoteFile(quote.attachment_path!, quote.file_name ?? "quotation").catch(
                  (e: unknown) => toast.error(errorText(e)),
                )
              }
            >
              <Download className="size-4" aria-hidden />
              <span className="sr-only">Download · 下载</span>
            </Button>
          )}
          {editable && (
            <Button variant="outline" size="sm" disabled={withdrawing} onClick={onWithdraw}>
              <Undo2 className="size-4" aria-hidden /> Withdraw · 撤回
            </Button>
          )}
        </div>
      </div>

      <QueryState
        isLoading={lines.isLoading}
        error={lines.error}
        isEmpty={(lines.data?.length ?? 0) === 0}
        onRetry={() => void lines.refetch()}
        empty={
          <p className="text-sm text-muted-foreground">
            No lines read from this file yet — UZA will review it by hand · 尚未识别到明细，UZA
            将人工审核
          </p>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Item · 品名</TableHead>
                <TableHead className="w-20">Unit · 单位</TableHead>
                <TableHead className="w-28 text-right">Qty · 数量</TableHead>
                <TableHead className="w-32 text-right">
                  Unit price · 单价 ({quote.currency})
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines.data ?? []).map((l) => (
                <QuoteLineRow key={l.id} line={l} currency={quote.currency} editable={editable} />
              ))}
            </TableBody>
          </Table>
        </div>
        {editable && (
          <p className="text-xs text-muted-foreground">
            You can correct quantities and prices until UZA starts its review · 在 UZA
            开始审核前，您可以修改数量和单价
          </p>
        )}
      </QueryState>
    </li>
  );
}

function QuoteLineRow({
  line,
  currency,
  editable,
}: {
  line: FactoryQuoteLine;
  currency: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(line.quantity === null ? "" : String(line.quantity));
  const [price, setPrice] = useState(fromMinorUnits(line.unit_price_minor, currency));

  const save = useMutation({
    mutationFn: () => {
      const q = qty.trim() === "" ? null : Number(qty);
      if (q !== null && (!Number.isFinite(q) || q < 0))
        throw new Error("Quantity must be a number · 数量必须是数字");
      const p = toMinorUnits(price, currency);
      if (price.trim() !== "" && p === null)
        throw new Error("Price must be a number · 单价必须是数字");
      return updateQuoteLine(line.id, { quantity: q, unit_price_minor: p });
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["factory-quote-lines", line.quote_id] }),
    onError: (e: unknown) => toast.error(errorText(e)),
  });

  const changed =
    qty !== (line.quantity === null ? "" : String(line.quantity)) ||
    price !== fromMinorUnits(line.unit_price_minor, currency);

  return (
    <TableRow>
      <TableCell className="tabular text-xs text-muted-foreground">
        {line.schedule_key ?? "+"}
      </TableCell>
      <TableCell>
        <p className="text-sm">{line.description}</p>
        {line.specification && (
          <p className="text-xs text-muted-foreground">{line.specification}</p>
        )}
      </TableCell>
      <TableCell className="text-sm">{line.unit ?? "—"}</TableCell>
      <TableCell className="text-right">
        {editable ? (
          <Input
            className="h-8 text-right tabular"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => changed && save.mutate()}
          />
        ) : (
          <span className="tabular">{qty || "—"}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {editable ? (
          <Input
            className="h-8 text-right tabular"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => changed && save.mutate()}
          />
        ) : (
          <span className="tabular">{price || "—"}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
