import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightToLine, Check, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { QueryState, EmptyState } from "@/components/DataState";
import { formatQuantity } from "@/lib/pricing";
import { useAuth } from "@/context/AuthContext";
import {
  SKIP_REASON_LABELS,
  planTakeoffToBoq,
  withCatalogItem,
  type PlannedLine,
  type TakeoffPlan,
} from "@/lib/takeoff-to-boq";
import {
  loadBoqContext,
  recordTakeoffTraining,
  writeTakeoffPlan,
  type BoqContext,
} from "@/services/takeoffToBoqService";

type TakeoffLine = {
  id: string;
  description: string;
  unit: string;
  material_category: string | null;
  ai_quantity: number | string | null;
  ai_confidence: number | string | null;
  ai_source: string | null;
  ai_rationale: string | null;
  human_quantity: number | string | null;
  status: string;
  measurement_method: string | null;
  catalog_item_id: string | null;
};

const REVIEWED = new Set(["accepted", "corrected"]);

function confidenceBadge(value: number | null) {
  if (value === null) return { label: "No AI estimate", variant: "outline" as const };
  if (value >= 0.85)
    return {
      label: `High confidence · ${Math.round(value * 100)}%`,
      variant: "secondary" as const,
    };
  if (value >= 0.6)
    return {
      label: `Medium confidence · ${Math.round(value * 100)}%`,
      variant: "outline" as const,
    };
  return { label: `Low confidence · ${Math.round(value * 100)}%`, variant: "destructive" as const };
}

export function TakeoffPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user, roles } = useAuth();

  const takeoff = useQuery({
    queryKey: ["takeoff-lines", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("takeoff_lines")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data as unknown as TakeoffLine[];
    },
  });

  const correct = useMutation({
    mutationFn: async (v: {
      line: TakeoffLine;
      quantity: number;
      reason: string;
      accept: boolean;
    }) => {
      const before =
        v.line.human_quantity !== null && v.line.human_quantity !== undefined
          ? Number(v.line.human_quantity)
          : v.line.ai_quantity !== null && v.line.ai_quantity !== undefined
            ? Number(v.line.ai_quantity)
            : null;

      const { error } = await supabase
        .from("takeoff_lines")
        .update({
          human_quantity: v.quantity,
          status: v.accept ? "accepted" : "corrected",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", v.line.id);
      if (error) throw error;

      // The learning loop: every human change is stored as training signal.
      const { error: cErr } = await supabase.from("takeoff_corrections").insert({
        takeoff_line_id: v.line.id,
        project_id: projectId,
        material_category: v.line.material_category,
        field: "quantity",
        before_value: before,
        after_value: v.quantity,
        reason: v.reason,
        role_tag: roles[0] ?? null,
        corrected_by: user?.id ?? null,
      });
      if (cErr) throw cErr;

      // The same review as a full training example (AI draft vs human final).
      // A failure here must not lose the review itself, which is already saved.
      try {
        await recordTakeoffTraining({
          projectId,
          userId: user?.id ?? null,
          line: v.line,
          finalQuantity: v.quantity,
          reason: v.reason,
          accepted: v.accept,
        });
      } catch (e) {
        console.error("[takeoff] training record not saved", e);
      }
    },
    onSuccess: () => {
      toast.success("Review recorded and captured as training signal.");
      void queryClient.invalidateQueries({ queryKey: ["takeoff-lines", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Takeoff lines already turned into BOQ lines (boq_lines.takeoff_line_id). */
  const inBoq = useQuery({
    queryKey: ["takeoff-boq-links", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_lines")
        .select("takeoff_line_id")
        .eq("project_id", projectId)
        .not("takeoff_line_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.takeoff_line_id as string));
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<{ plan: TakeoffPlan; context: BoqContext } | null>(null);

  const rows = takeoff.data ?? [];
  const linked = inBoq.data ?? new Set<string>();
  const sendable = rows.filter((r) => REVIEWED.has(r.status) && !linked.has(r.id));

  const prepare = useMutation({
    mutationFn: async () => {
      const context = await loadBoqContext(projectId);
      const only = selected.size > 0 ? selected : undefined;
      const plan = planTakeoffToBoq({
        takeoff: rows,
        alreadyInBoq: context.alreadyInBoq,
        houses: context.houses,
        floors: context.floors,
        rooms: context.rooms,
        items: context.items,
        categories: context.categories,
        ...(only ? { only } : {}),
      });
      return { plan, context };
    },
    onSuccess: (result) => {
      if (result.plan.lines.length === 0) {
        toast.info("Nothing to send: only reviewed lines that are not in the BOQ yet can be sent.");
        return;
      }
      setSending(result);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden /> Takeoff review
        </CardTitle>
        <CardDescription>
          Every AI-proposed quantity is a draft shown with its confidence level and its source, side
          by side with the human value. Nothing here is a fact until a specialist accepts it.
        </CardDescription>
        {sendable.length > 0 && (
          <div className="pt-2">
            <Button size="sm" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
              <ArrowRightToLine className="size-4" aria-hidden />
              {prepare.isPending
                ? "Preparing…"
                : selected.size > 0
                  ? `Send ${selected.size} selected to BOQ`
                  : `Send all ${sendable.length} reviewed to BOQ`}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={takeoff.isLoading}
          error={takeoff.error}
          isEmpty={rows.length === 0}
          onRetry={() => void takeoff.refetch()}
          empty={
            <EmptyState
              title="No takeoff lines yet"
              description="Once drawings are read, proposed quantities will appear here as drafts — each with a confidence level, the drawing it came from, and space for the reviewed human value."
            />
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      aria-label="Select every reviewed line not yet in the BOQ"
                      checked={sendable.length > 0 && sendable.every((r) => selected.has(r.id))}
                      onCheckedChange={(on) =>
                        setSelected(on ? new Set(sendable.map((r) => r.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>AI draft</TableHead>
                  <TableHead>Confidence & source</TableHead>
                  <TableHead className="text-right">Human value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((line) => {
                  const ai = line.ai_quantity === null ? null : Number(line.ai_quantity);
                  const human = line.human_quantity === null ? null : Number(line.human_quantity);
                  const conf = confidenceBadge(
                    line.ai_confidence === null ? null : Number(line.ai_confidence),
                  );
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        {REVIEWED.has(line.status) && !linked.has(line.id) && (
                          <Checkbox
                            aria-label={`Select ${line.description}`}
                            checked={selected.has(line.id)}
                            onCheckedChange={(on) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (on) next.add(line.id);
                                else next.delete(line.id);
                                return next;
                              })
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.unit}
                          {line.material_category ? ` · ${line.material_category}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="tabular">
                        {ai === null ? "—" : formatQuantity(ai)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={conf.variant}>{conf.label}</Badge>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {line.ai_source ?? "Source not recorded"}
                        </p>
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {human === null ? "Not reviewed" : formatQuantity(human)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={line.status === "accepted" ? "secondary" : "outline"}
                          className="capitalize"
                        >
                          {line.status}
                        </Badge>
                        {linked.has(line.id) && (
                          <Badge variant="default" className="ml-1">
                            In BOQ
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ReviewDialog
                          line={line}
                          onSubmit={(quantity, reason, accept) =>
                            correct.mutate({ line, quantity, reason, accept })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </QueryState>
      </CardContent>

      {sending && (
        <SendToBoqDialog
          projectId={projectId}
          plan={sending.plan}
          context={sending.context}
          onClose={() => setSending(null)}
          onDone={() => {
            setSending(null);
            setSelected(new Set());
            for (const key of [
              ["boq-lines", projectId],
              ["houses", projectId],
              ["floors", projectId],
              ["rooms", projectId],
              ["project-rooms", projectId],
              ["takeoff-boq-links", projectId],
            ]) {
              void queryClient.invalidateQueries({ queryKey: key });
            }
          }}
        />
      )}
    </Card>
  );
}

const NO_ITEM = "__none__";

/**
 * The QS confirms where each reviewed quantity lands and which catalog item
 * prices it before anything is written. Nothing is guessed: a line with no
 * confident catalog match goes in unpriced, flagged, until someone chooses.
 */
function SendToBoqDialog({
  projectId,
  plan,
  context,
  onClose,
  onDone,
}: {
  projectId: string;
  plan: TakeoffPlan;
  context: BoqContext;
  onClose: () => void;
  onDone: () => void;
}) {
  const [lines, setLines] = useState<PlannedLine[]>(plan.lines);
  const itemById = useMemo(() => new Map(context.items.map((i) => [i.id, i])), [context.items]);
  const categoryName = useMemo(
    () => new Map(context.categories.map((c) => [c.id, c.name])),
    [context.categories],
  );
  const unpriced = lines.filter((l) => l.needsCatalogItem).length;

  const write = useMutation({
    mutationFn: () => writeTakeoffPlan({ projectId, plan, lines, context }),
    onSuccess: ({ written, roomsCreated }) => {
      toast.success(
        `${written} line(s) added to the BOQ${roomsCreated ? `, ${roomsCreated} room(s) created` : ""}.` +
          (unpriced ? ` ${unpriced} still need a catalog item to be priced.` : ""),
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: (l: PlannedLine) => PlannedLine) =>
    setLines((prev) => prev.map((l, j) => (j === i ? patch(l) : l)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send {lines.length} reviewed line(s) to the BOQ</DialogTitle>
          <DialogDescription>
            Check the room each quantity lands in and the catalog item that prices it. Wastage comes
            from the catalog item. New floors and rooms are created only where a line needs one.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Catalog item</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => {
                const suggested = l.suggestedCategoryId;
                const options = [...context.items].sort((a, b) => {
                  const sa = a.category_id === suggested ? 0 : 1;
                  const sb = b.category_id === suggested ? 0 : 1;
                  return sa - sb || a.name.localeCompare(b.name);
                });
                return (
                  <TableRow key={l.takeoffLineId}>
                    <TableCell className="min-w-48">
                      <p className="font-medium">{l.label}</p>
                      <p className="text-xs text-muted-foreground">{l.note}</p>
                    </TableCell>
                    <TableCell className="min-w-52">
                      <Select
                        value={l.roomKey}
                        onValueChange={(v) => update(i, (x) => ({ ...x, roomKey: v }))}
                      >
                        <SelectTrigger aria-label={`Room for ${l.label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {plan.roomOptions.map((o) => (
                            <SelectItem key={o.key} value={o.key}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-56">
                      <Select
                        value={l.catalogItemId ?? NO_ITEM}
                        onValueChange={(v) =>
                          update(i, (x) =>
                            withCatalogItem(x, v === NO_ITEM ? null : (itemById.get(v) ?? null)),
                          )
                        }
                      >
                        <SelectTrigger aria-label={`Catalog item for ${l.label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ITEM}>Choose later (unpriced)</SelectItem>
                          {options.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {categoryName.get(item.category_id) ?? "—"} — {item.name} ({item.unit}
                              )
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {l.needsCatalogItem && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Needs a catalog item to be priced
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatQuantity(l.quantity)} {l.unit}
                      {l.wastagePct > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatQuantity(l.baseQuantity)} + {l.wastagePct}% wastage
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {plan.skipped.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {plan.skipped.length} line(s) not sent
            </summary>
            <ul className="mt-2 space-y-1">
              {plan.skipped.map((s) => (
                <li key={s.takeoffLineId} className="text-muted-foreground">
                  {s.label} — {SKIP_REASON_LABELS[s.reason]}
                </li>
              ))}
            </ul>
          </details>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => write.mutate()} disabled={write.isPending || lines.length === 0}>
            {write.isPending ? "Adding…" : `Add ${lines.length} line(s) to the BOQ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  line,
  onSubmit,
}: {
  line: TakeoffLine;
  onSubmit: (quantity: number, reason: string, accept: boolean) => void;
}) {
  const aiValue = line.ai_quantity === null ? "" : String(Number(line.ai_quantity));
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(
    line.human_quantity !== null && line.human_quantity !== undefined
      ? String(Number(line.human_quantity))
      : aiValue,
  );
  const [reason, setReason] = useState("");
  const unchanged = quantity === aiValue;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review “{line.description}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              AI draft: {aiValue === "" ? "none" : `${aiValue} ${line.unit}`}
            </p>
            <p className="mt-1 text-muted-foreground">
              {line.ai_rationale ?? "No rationale recorded for this draft."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Confirmed quantity ({line.unit})</Label>
            <Input
              id="qty"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Why (captured as training signal)</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                unchanged
                  ? "Accepted as drafted"
                  : "e.g. drawing shows a bulkhead the reader missed"
              }
            />
          </div>
          <Button
            className="w-full"
            disabled={quantity === "" || (!unchanged && reason.trim() === "")}
            onClick={() => {
              onSubmit(Number(quantity), reason.trim() || "Accepted as drafted", unchanged);
              setOpen(false);
            }}
          >
            {unchanged ? <Check className="size-4" /> : <Undo2 className="size-4" />}
            {unchanged ? "Accept AI draft" : "Save correction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
