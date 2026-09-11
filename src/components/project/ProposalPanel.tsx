import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryState, EmptyState } from "@/components/DataState";
import { formatMoney, roundClientTotal, toMinor } from "@/lib/pricing";
import type { CurrencyCode } from "@/config/policy";
import { useAuth } from "@/context/AuthContext";

export function ProposalPanel({
  projectId,
  currency,
  projectName,
  suggestedPriceMinor,
}: {
  projectId: string;
  currency: CurrencyCode;
  projectName: string;
  suggestedPriceMinor: number;
}) {
  const queryClient = useQueryClient();
  const { user, isCostBlind } = useAuth();

  const proposals = useQuery({
    queryKey: ["proposals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (v: { title: string; summary: string; scope: string; priceMinor: number }) => {
      const { error } = await supabase.from("proposals").insert({
        project_id: projectId,
        title: v.title,
        summary: v.summary || null,
        scope_notes: v.scope || null,
        currency,
        client_price_minor: v.priceMinor,
        status: "draft",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposal drafted.");
      void queryClient.invalidateQueries({ queryKey: ["proposals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("proposals")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposal issued to the client.");
      void queryClient.invalidateQueries({ queryKey: ["proposals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = proposals.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="size-5 text-primary" aria-hidden /> Client proposal
            </CardTitle>
            <CardDescription>
              A presentable solution document — the agreed price and the scope behind it. Cost build-up, rates and
              margin are never shown here.
            </CardDescription>
          </div>
          {!isCostBlind && (
            <NewProposalDialog
              currency={currency}
              projectName={projectName}
              suggestedPriceMinor={suggestedPriceMinor}
              onSubmit={(v) => create.mutate(v)}
            />
          )}
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={proposals.isLoading}
            error={proposals.error}
            isEmpty={rows.length === 0}
            onRetry={() => void proposals.refetch()}
            empty={
              <EmptyState
                title="No proposal drafted yet"
                description="Once a BOQ version is priced and signed off, the client-facing solution document will appear here with its scope, options and single agreed price."
              />
            }
          >
            <div className="space-y-4">
              {rows.map((p) => (
                <article key={p.id} className="rounded-lg border p-5 print:border-0">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{p.title}</h3>
                      <p className="text-sm text-muted-foreground">{projectName}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={p.status === "issued" ? "default" : "secondary"} className="capitalize">
                        {p.status}
                      </Badge>
                      <p className="tabular mt-2 text-2xl font-semibold">
                        {formatMoney(Number(p.client_price_minor), p.currency as CurrencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">Agreed solution price</p>
                    </div>
                  </header>
                  {p.summary && <p className="mt-4 text-sm">{p.summary}</p>}
                  {p.scope_notes && (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scope</p>
                      <p className="mt-1 whitespace-pre-line text-sm">{p.scope_notes}</p>
                    </div>
                  )}
                  <footer className="mt-4 flex flex-wrap gap-2 print:hidden">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="size-4" /> Print / save as PDF
                    </Button>
                    {!isCostBlind && p.status === "draft" && (
                      <Button size="sm" onClick={() => issue.mutate(p.id)}>
                        Issue to client
                      </Button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function NewProposalDialog({
  currency,
  projectName,
  suggestedPriceMinor,
  onSubmit,
}: {
  currency: CurrencyCode;
  projectName: string;
  suggestedPriceMinor: number;
  onSubmit: (v: { title: string; summary: string; scope: string; priceMinor: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`${projectName} — finishing solution`);
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState("");
  const [price, setPrice] = useState(String(roundClientTotal(suggestedPriceMinor, currency)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Draft proposal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draft client proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-title">Title</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-summary">Summary for the client</Label>
            <Textarea id="p-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-scope">Scope included</Label>
            <Textarea id="p-scope" rows={4} value={scope} onChange={(e) => setScope(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-price">Agreed solution price ({currency})</Label>
            <Input id="p-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Suggested from the priced BOQ: {formatMoney(roundClientTotal(suggestedPriceMinor, currency), currency)}
            </p>
          </div>
          <Button
            className="w-full"
            disabled={!title.trim() || price === ""}
            onClick={() => {
              onSubmit({
                title: title.trim(),
                summary: summary.trim(),
                scope: scope.trim(),
                priceMinor: toMinor(Number(price), currency),
              });
              setOpen(false);
            }}
          >
            Save draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
