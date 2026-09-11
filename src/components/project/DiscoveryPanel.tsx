import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, HardHat, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState, EmptyState } from "@/components/DataState";
import { DISCOVERY_SECTIONS, ENGAGEMENT_PROTOCOL, ENGAGEMENT_STANDARD } from "@/config/discovery";
import { useAuth } from "@/context/AuthContext";

const STATUSES = [
  { value: "missing", label: "Not answered yet" },
  { value: "draft", label: "Client indicated — not confirmed" },
  { value: "confirmed", label: "Confirmed by client" },
  { value: "not_applicable", label: "Not applicable" },
];

type Row = {
  id: string;
  question_key: string;
  client_answer: string | null;
  internal_note: string | null;
  status: string;
  blocks_procurement: boolean;
};

export function DiscoveryPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Record<string, { client_answer: string; internal_note: string }>>({});

  const discovery = useQuery({
    queryKey: ["discovery", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_discovery")
        .select("id, question_key, client_answer, internal_note, status, blocks_procurement")
        .eq("project_id", projectId);
      if (error) throw error;
      return data as Row[];
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const rows = DISCOVERY_SECTIONS.flatMap((section, si) =>
        section.questions.map((q, qi) => ({
          project_id: projectId,
          section: section.key,
          question_key: q.key,
          question: q.question,
          guidance: q.guidance,
          blocks_procurement: q.blocksProcurement ?? false,
          client_visible: q.clientVisible ?? true,
          sort_order: si * 100 + qi,
        })),
      );
      const { error } = await supabase.from("project_discovery").upsert(rows, { onConflict: "project_id,question_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client session sheet ready.");
      void queryClient.invalidateQueries({ queryKey: ["discovery", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (input: { id: string; client_answer: string; internal_note: string; status?: string }) => {
      const { error } = await supabase
        .from("project_discovery")
        .update({
          client_answer: input.client_answer || null,
          internal_note: input.internal_note || null,
          ...(input.status ? { status: input.status } : {}),
          answered_by: user?.id ?? null,
          answered_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recorded against the project.");
      void queryClient.invalidateQueries({ queryKey: ["discovery", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = discovery.data ?? [];
  const byKey = new Map(rows.map((r) => [r.question_key, r]));
  const blocking = rows.filter((r) => r.blocks_procurement && r.status !== "confirmed" && r.status !== "not_applicable");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4" aria-hidden /> How we run this project together
            </CardTitle>
            <CardDescription>The same four steps on every heavy project, in order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ENGAGEMENT_PROTOCOL.map((s) => (
              <div key={s.step} className="rounded-md border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="tabular text-muted-foreground">{s.step}.</span>
                  {s.title}
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {s.owner}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardHat className="size-4" aria-hidden /> How we show up
            </CardTitle>
            <CardDescription>Applies to every client meeting and every site visit.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {ENGAGEMENT_STANDARD.map((line) => (
                <li key={line} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {blocking.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" aria-hidden /> Missing before procurement can start (
              <span className="tabular">{blocking.length}</span>)
            </CardTitle>
            <CardDescription>
              These answers are required before we ask a factory for a comparable quotation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocking.map((r) => {
              const q = DISCOVERY_SECTIONS.flatMap((s) => s.questions).find((x) => x.key === r.question_key);
              return (
                <p key={r.id} className="rounded-md border p-2 text-sm">
                  {q?.question ?? r.question_key}
                </p>
              );
            })}
          </CardContent>
        </Card>
      )}

      <QueryState
        isLoading={discovery.isLoading}
        error={discovery.error}
        isEmpty={rows.length === 0}
        onRetry={() => void discovery.refetch()}
        empty={
          <EmptyState
            title="No client session sheet yet"
            description="Create the guided sheet before the next client meeting. It holds the questions to ask, the client's confirmed answers and your internal notes, so everyone on our side understands the client the same way."
            action={
              <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
                <ClipboardList className="size-4" /> Create client session sheet
              </Button>
            }
          />
        }
      >
        <div className="space-y-6">
          {DISCOVERY_SECTIONS.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.intent}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {section.questions.map((q) => {
                  const row = byKey.get(q.key);
                  if (!row) return null;
                  const d = draft[row.id] ?? {
                    client_answer: row.client_answer ?? "",
                    internal_note: row.internal_note ?? "",
                  };
                  return (
                    <div key={q.key} className="space-y-3 rounded-md border p-4">
                      <div className="flex flex-wrap items-start gap-2">
                        <p className="flex-1 text-sm font-medium">{q.question}</p>
                        {q.blocksProcurement && (
                          <Badge variant="outline" className="text-[10px]">
                            Blocks procurement
                          </Badge>
                        )}
                        {q.clientVisible === false && (
                          <Badge variant="secondary" className="text-[10px]">
                            Internal only
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{q.guidance}</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`a-${row.id}`} className="text-xs">
                            What the client said
                          </Label>
                          <Textarea
                            id={`a-${row.id}`}
                            rows={3}
                            value={d.client_answer}
                            onChange={(e) => setDraft((p) => ({ ...p, [row.id]: { ...d, client_answer: e.target.value } }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`n-${row.id}`} className="text-xs">
                            Our note, guidance or reservation
                          </Label>
                          <Textarea
                            id={`n-${row.id}`}
                            rows={3}
                            value={d.internal_note}
                            onChange={(e) => setDraft((p) => ({ ...p, [row.id]: { ...d, internal_note: e.target.value } }))}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={row.status}
                          onValueChange={(status) => save.mutate({ id: row.id, ...d, status })}
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="secondary" onClick={() => save.mutate({ id: row.id, ...d })}>
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
