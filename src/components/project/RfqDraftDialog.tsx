import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Copy, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { draftPackageRfq, type RfqDraftResult } from "@/lib/rfq.functions";
import { setManufacturerStatus, type PackageManufacturer } from "@/services/packageService";

const GENERIC = "__all__";

/**
 * One click from a package to a ready-to-send RFQ in English and Chinese.
 * The schedule comes from the BOQ; the client, project, money and rival
 * factories are stripped before anything is drafted (src/lib/rfq.ts).
 * Nothing is sent from here — the team copies it into email or WeChat and
 * marks the factories as "RFQ sent".
 */
export function RfqDraftDialog({
  packageId,
  packageTitle,
  manufacturers,
  supplierNames,
  onClose,
  onStatusChanged,
}: {
  packageId: string;
  packageTitle: string;
  manufacturers: PackageManufacturer[];
  supplierNames: Record<string, string>;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const draft = useServerFn(draftPackageRfq);
  const [addressee, setAddressee] = useState<string>(GENERIC);
  const [result, setResult] = useState<RfqDraftResult | null>(null);
  const [english, setEnglish] = useState("");
  const [chinese, setChinese] = useState("");
  const [sentTo, setSentTo] = useState<string[]>(manufacturers.map((m) => m.id));

  const run = useMutation({
    mutationFn: () =>
      draft({ data: { packageId, supplierId: addressee === GENERIC ? null : addressee } }),
    onSuccess: (r) => {
      setResult(r);
      setEnglish(`${r.subject}\n\n${r.english}`);
      setChinese(r.chinese ? `${r.subject}\n\n${r.chinese}` : "");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not draft the RFQ."),
  });

  const markSent = useMutation({
    mutationFn: async () => {
      for (const id of sentTo) await setManufacturerStatus(id, "rfq_sent");
    },
    onSuccess: () => {
      toast.success(`Marked ${sentTo.length} manufacturer(s) as "RFQ sent".`);
      onStatusChanged();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update the status."),
  });

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Copy failed — select the text and copy it by hand.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request for quotation — {packageTitle}</DialogTitle>
          <DialogDescription>
            Built from this package's specification and the matching BOQ lines. The client, the
            project, the site, every price and the other factories are removed before anything is
            drafted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-1">
            <Label>Addressed to</Label>
            <Select value={addressee} onValueChange={setAddressee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERIC}>
                  “Dear Supplier” (same text for every factory)
                </SelectItem>
                {manufacturers.map((m) => (
                  <SelectItem key={m.supplier_id} value={m.supplier_id}>
                    {supplierNames[m.supplier_id] ?? "Manufacturer"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <Sparkles className="size-4" aria-hidden />
            {run.isPending
              ? "Drafting in English and Chinese…"
              : result
                ? "Draft again"
                : "Draft RFQ"}
          </Button>
        </div>

        {result && (
          <>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                {result.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Reference {result.reference} · {result.scheduleLines} schedule line(s) from the BOQ.
              Quantities are copied from the BOQ, never written by the AI. You can edit both
              versions before copying.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rfq-en">English</Label>
                  <Button variant="outline" size="sm" onClick={() => void copy(english, "English")}>
                    <Copy className="size-4" aria-hidden /> Copy English
                  </Button>
                </div>
                <Textarea
                  id="rfq-en"
                  rows={24}
                  className="font-mono text-xs"
                  value={english}
                  onChange={(e) => setEnglish(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rfq-zh">中文 (Simplified Chinese)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!chinese}
                    onClick={() => void copy(chinese, "Chinese")}
                  >
                    <Copy className="size-4" aria-hidden /> Copy Chinese
                  </Button>
                </div>
                <Textarea
                  id="rfq-zh"
                  rows={24}
                  className="font-mono text-xs"
                  value={chinese}
                  placeholder="No Chinese version yet — draft again."
                  onChange={(e) => setChinese(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                variant="outline"
                onClick={() =>
                  void copy(
                    chinese ? `${chinese}\n\n————————\n\n${english}` : english,
                    "Both versions",
                  )
                }
              >
                <Copy className="size-4" aria-hidden /> Copy both (Chinese first)
              </Button>

              {manufacturers.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  {manufacturers.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={sentTo.includes(m.id)}
                        onCheckedChange={(v) =>
                          setSentTo((s) =>
                            v ? [...new Set([...s, m.id])] : s.filter((x) => x !== m.id),
                          )
                        }
                      />
                      {supplierNames[m.supplier_id] ?? "Manufacturer"}
                    </label>
                  ))}
                  <Button
                    disabled={sentTo.length === 0 || markSent.isPending}
                    onClick={() => markSent.mutate()}
                  >
                    <Send className="size-4" aria-hidden /> Mark RFQ sent
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
