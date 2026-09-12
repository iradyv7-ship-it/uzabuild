import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Box, RefreshCw, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState, EmptyState } from "@/components/DataState";
import {
  ensureSpeckleProject,
  sendDrawingToSpeckle,
  refreshSpeckleIngestion,
  listSpeckleIssues,
  postSpeckleIssue,
} from "@/lib/speckle.functions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Converting…",
  success: "Ready to view",
  error: "Failed",
};

/**
 * A client-browsable 3D/BIM rendering of the project, embedding Speckle's
 * own web viewer, plus Speckle's comment/markup thread (Speckle now calls
 * these "Issues" — see the provenance note in speckle.functions.ts) for a
 * selected model.
 *
 * One Speckle model per uploaded drawing: a client picks a drawing (e.g. one
 * per floor or zone) from the list below to browse it.
 *
 * When `canManage` is false (the client portal) the send-to-Speckle and
 * status-polling controls are hidden — a client views and comments, a UZA
 * staffer decides what gets rendered.
 */
export function RenderingPanel({ projectId, canManage = true }: { projectId: string; canManage?: boolean }) {
  const queryClient = useQueryClient();
  const ensureProject = useServerFn(ensureSpeckleProject);
  const sendToSpeckle = useServerFn(sendDrawingToSpeckle);
  const refreshIngestion = useServerFn(refreshSpeckleIngestion);
  const listIssues = useServerFn(listSpeckleIssues);
  const postIssue = useServerFn(postSpeckleIssue);

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");

  const link = useQuery({
    queryKey: ["speckle-project", projectId, canManage],
    queryFn: async () => {
      // A read-only viewer (the client portal) never creates the Speckle
      // project as a side effect of just opening the page — only a manager
      // action (sending a drawing) does that. Read the link directly instead
      // of calling ensureSpeckleProject.
      if (!canManage) {
        const { data, error } = await supabase
          .from("project_speckle_projects")
          .select("id")
          .eq("project_id", projectId)
          .maybeSingle();
        if (error) throw error;
        // Whether or not a link exists yet, a client sees "no model sent
        // yet" rather than a staff-facing "connect Speckle" message.
        return { configured: true as const, link: data };
      }
      return ensureProject({ data: { projectId } });
    },
  });

  const models = useQuery({
    queryKey: ["speckle-models", projectId],
    enabled: link.data?.configured === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_speckle_models")
        .select("id, drawing_id, speckle_model_name, ingestion_status, ingestion_error, embed_url, latest_version_id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    // Cheap poll while anything is still converting — Speckle's own
    // conversion time varies with file size and format.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((m) => m.ingestion_status === "pending") ? 5000 : false,
  });

  const unsent = useQuery({
    queryKey: ["drawings-unsent-to-speckle", projectId],
    enabled: canManage && link.data?.configured === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawings")
        .select("id, file_name")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const sent = new Set((models.data ?? []).map((m) => m.drawing_id));
      return (data ?? []).filter((d) => !sent.has(d.id));
    },
  });

  const send = useMutation({
    mutationFn: (drawingId: string) => sendToSpeckle({ data: { drawingId } }),
    onSuccess: () => {
      toast.success("Sent to Speckle — conversion runs in the background.");
      void queryClient.invalidateQueries({ queryKey: ["speckle-models", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["drawings-unsent-to-speckle", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: (drawingId: string) => refreshIngestion({ data: { drawingId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["speckle-models", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = useMemo(() => (models.data ?? []).filter((m) => m.ingestion_status === "success"), [models.data]);
  useEffect(() => {
    if (!selectedDrawingId && ready[0]) setSelectedDrawingId(ready[0].drawing_id);
  }, [ready, selectedDrawingId]);
  const active = ready.find((m) => m.drawing_id === selectedDrawingId) ?? null;

  const issues = useQuery({
    queryKey: ["speckle-issues", selectedDrawingId],
    enabled: !!selectedDrawingId,
    queryFn: () => listIssues({ data: { drawingId: selectedDrawingId! } }),
  });

  const postComment = useMutation({
    mutationFn: () => postIssue({ data: { drawingId: selectedDrawingId!, title: issueTitle, body: issueBody } }),
    onSuccess: () => {
      setIssueTitle("");
      setIssueBody("");
      toast.success("Comment posted on Speckle.");
      void queryClient.invalidateQueries({ queryKey: ["speckle-issues", selectedDrawingId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (link.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Checking rendering setup…</p>
        </CardContent>
      </Card>
    );
  }

  if (link.data?.configured === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3D rendering</CardTitle>
          <CardDescription>Browse the model and leave comments on specific rooms or zones.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Rendering is not connected yet"
            description="This needs a Speckle (speckle.systems) account and a SPECKLE_API_TOKEN set on the server. Ask an admin to connect it — nothing else on this page is affected while it is unset."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send drawings to Speckle</CardTitle>
            <CardDescription>
              Each drawing becomes its own browsable model — send one per floor or zone so a client can
              pick which part of the building to look at.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={unsent.isLoading}
              error={unsent.error}
              isEmpty={(unsent.data ?? []).length === 0}
              onRetry={() => void unsent.refetch()}
              empty={
                <EmptyState
                  title="Every uploaded drawing has been sent"
                  description="Upload more drawings under Drawings & documents and they will appear here."
                />
              }
            >
              <ul className="space-y-2">
                {(unsent.data ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span className="font-medium">{d.file_name}</span>
                    <Button size="sm" variant="outline" disabled={send.isPending} onClick={() => send.mutate(d.id)}>
                      <Send className="size-4" /> Send to Speckle
                    </Button>
                  </li>
                ))}
              </ul>
            </QueryState>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="size-4" aria-hidden /> Models
          </CardTitle>
          <CardDescription>
            Conversion runs on Speckle's side and can take a few minutes depending on file size and format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={models.isLoading}
            error={models.error}
            isEmpty={(models.data ?? []).length === 0}
            onRetry={() => void models.refetch()}
            empty={
              <EmptyState
                title="No model sent yet"
                description={
                  canManage
                    ? "Send a drawing above to create the first browsable model."
                    : "Your UZA contact has not sent a rendering yet."
                }
              />
            }
          >
            <ul className="space-y-2">
              {(models.data ?? []).map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${
                    m.drawing_id === selectedDrawingId ? "border-primary bg-muted" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left font-medium disabled:cursor-not-allowed disabled:text-muted-foreground"
                    disabled={m.ingestion_status !== "success"}
                    onClick={() => setSelectedDrawingId(m.drawing_id)}
                  >
                    {m.speckle_model_name}
                  </button>
                  <Badge
                    variant={
                      m.ingestion_status === "success"
                        ? "default"
                        : m.ingestion_status === "error"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS_LABEL[m.ingestion_status] ?? m.ingestion_status}
                  </Badge>
                  {canManage && m.ingestion_status === "pending" && (
                    <Button size="sm" variant="ghost" disabled={refresh.isPending} onClick={() => refresh.mutate(m.drawing_id)}>
                      <RefreshCw className="size-4" /> Check status
                    </Button>
                  )}
                  {m.ingestion_status === "error" && m.ingestion_error && (
                    <p className="w-full text-xs text-destructive">{m.ingestion_error}</p>
                  )}
                </li>
              ))}
            </ul>
          </QueryState>

          {ready.length > 1 && (
            <div className="mt-4 max-w-xs space-y-1.5">
              <Label>Viewing</Label>
              <Select value={selectedDrawingId ?? ""} onValueChange={setSelectedDrawingId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ready.map((m) => (
                    <SelectItem key={m.drawing_id} value={m.drawing_id}>
                      {m.speckle_model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {active && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">{active.speckle_model_name}</CardTitle>
              <CardDescription>Drag to orbit, scroll to zoom. Comments are on the right.</CardDescription>
            </CardHeader>
            <CardContent>
              {active.embed_url ? (
                <iframe
                  title={`Speckle viewer — ${active.speckle_model_name}`}
                  src={active.embed_url}
                  className="h-[520px] w-full rounded-md border"
                  allow="fullscreen; xr-spatial-tracking"
                />
              ) : (
                <EmptyState
                  title="No viewer link yet"
                  description="This model has no embed URL recorded — check status again in a moment."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4" aria-hidden /> Comments
              </CardTitle>
              <CardDescription>
                Posted straight to this model in Speckle (Speckle calls these "Issues").
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <QueryState
                isLoading={issues.isLoading}
                error={issues.error}
                isEmpty={(issues.data?.issues ?? []).length === 0}
                onRetry={() => void issues.refetch()}
                empty={
                  <EmptyState title="No comments yet" description="Be the first to leave one on this model." />
                }
              >
                <ul className="space-y-2">
                  {(issues.data?.issues ?? []).map((i) => (
                    <li key={i.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{i.title ?? "Untitled"}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {i.status}
                        </Badge>
                      </div>
                      {i.rawDescription && <p className="mt-1 whitespace-pre-wrap">{i.rawDescription}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i.authorName ?? "Someone"} · {new Date(i.createdAt).toLocaleString()}
                        {i.replyCount > 0 ? ` · ${i.replyCount} repl${i.replyCount === 1 ? "y" : "ies"}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </QueryState>

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="issue-title">New comment</Label>
                <Input
                  id="issue-title"
                  placeholder="Short title, e.g. Guest bathroom tile colour"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                />
                <Textarea
                  rows={3}
                  placeholder="Details (optional)"
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This posts against the whole model. To pin a comment to a specific point in 3D, open the
                  viewer above full-screen on Speckle and comment there — that needs the viewer's own camera
                  state, which this panel does not capture.
                </p>
                <Button
                  size="sm"
                  disabled={!issueTitle.trim() || postComment.isPending}
                  onClick={() => postComment.mutate()}
                >
                  <Send className="size-4" /> Post comment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
