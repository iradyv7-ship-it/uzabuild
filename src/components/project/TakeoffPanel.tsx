import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState, EmptyState } from "@/components/DataState";
import { formatQuantity } from "@/lib/pricing";
import { useAuth } from "@/context/AuthContext";

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
};

function confidenceBadge(value: number | null) {
  if (value === null) return { label: "No AI estimate", variant: "outline" as const };
  if (value >= 0.85) return { label: `High confidence · ${Math.round(value * 100)}%`, variant: "secondary" as const };
  if (value >= 0.6) return { label: `Medium confidence · ${Math.round(value * 100)}%`, variant: "outline" as const };
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
    mutationFn: async (v: { line: TakeoffLine; quantity: number; reason: string; accept: boolean }) => {
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
    },
    onSuccess: () => {
      toast.success("Review recorded and captured as training signal.");
      void queryClient.invalidateQueries({ queryKey: ["takeoff-lines", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = takeoff.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden /> Takeoff review
        </CardTitle>
        <CardDescription>
          Every AI-proposed quantity is a draft shown with its confidence level and its source, side by side with the
          human value. Nothing here is a fact until a specialist accepts it.
        </CardDescription>
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
                  const conf = confidenceBadge(line.ai_confidence === null ? null : Number(line.ai_confidence));
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="font-medium">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.unit}
                          {line.material_category ? ` · ${line.material_category}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="tabular">{ai === null ? "—" : formatQuantity(ai)}</TableCell>
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
                        <Badge variant={line.status === "accepted" ? "secondary" : "outline"} className="capitalize">
                          {line.status}
                        </Badge>
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
    </Card>
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
    line.human_quantity !== null && line.human_quantity !== undefined ? String(Number(line.human_quantity)) : aiValue,
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
            <p className="font-medium">AI draft: {aiValue === "" ? "none" : `${aiValue} ${line.unit}`}</p>
            <p className="mt-1 text-muted-foreground">{line.ai_rationale ?? "No rationale recorded for this draft."}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Confirmed quantity ({line.unit})</Label>
            <Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Why (captured as training signal)</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={unchanged ? "Accepted as drafted" : "e.g. drawing shows a bulkhead the reader missed"}
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
