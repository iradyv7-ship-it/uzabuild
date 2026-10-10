import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Download, FileText, FileUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryState, EmptyState } from "@/components/DataState";
import { useAuth } from "@/context/AuthContext";
import { DocumentTimeline } from "@/components/portal/DocumentTimeline";
import {
  CLIENT_UPLOAD_ACCEPT,
  listClientDocuments,
  listDocumentActivity,
  openFile,
  reviewStatusLabel,
  submitClientDrawings,
  withdrawClientDrawing,
} from "@/services/clientWorkspaceService";

function statusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "needs_revision") return "destructive";
  if (status === "received") return "outline";
  return "secondary";
}

/**
 * The client sends their technical drawings and follows the work on each one.
 * Their own submissions and the documents UZA released to them sit in one
 * list; each opens onto the timeline of what the team has done with it.
 */
export function ClientSubmissions({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const docsKey = ["client-documents", projectId] as const;
  const activityKey = ["document-activity", projectId] as const;

  const documents = useQuery({ queryKey: docsKey, queryFn: () => listClientDocuments(projectId) });
  const activity = useQuery({
    queryKey: activityKey,
    queryFn: () => listDocumentActivity(projectId),
  });

  const submit = useMutation({
    mutationFn: () =>
      submitClientDrawings({ projectId, files: pending, note, userId: user?.id ?? null }),
    onSuccess: () => {
      toast.success(
        pending.length === 1
          ? "Drawing sent. You will see the team's progress on it here."
          : `${pending.length} files sent. You will see the team's progress on each one here.`,
      );
      setPending([]);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: docsKey });
      void queryClient.invalidateQueries({ queryKey: activityKey });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send those files."),
  });

  const withdraw = useMutation({
    mutationFn: withdrawClientDrawing,
    onSuccess: () => {
      toast.success("Submission withdrawn.");
      void queryClient.invalidateQueries({ queryKey: docsKey });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not withdraw that."),
  });

  const rows = documents.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your drawings and documents</CardTitle>
        <CardDescription>
          Send architectural, structural or MEP drawings, models, site photos or a written brief.
          Only the UZA specialists assigned to your project can open what you send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-md border border-dashed p-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={CLIENT_UPLOAD_ACCEPT}
            className="sr-only"
            aria-label="Choose drawings to send"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) setPending((p) => [...p, ...files]);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <FileUp className="size-4" aria-hidden /> Choose files
            </Button>
            <span className="text-xs text-muted-foreground">
              PDF, DWG, DXF, IFC, RVT, SKP, photos, Excel, Word or PowerPoint — up to 100 MB each.
            </span>
          </div>
          {pending.length > 0 && (
            <>
              <ul className="space-y-1 text-sm">
                {pending.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="space-y-1">
                <Label htmlFor="submission-note">What should the team know about these?</Label>
                <Textarea
                  id="submission-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Revision B of the ground floor — the kitchen wall moved 600 mm."
                />
              </div>
              <Button type="button" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending
                  ? "Sending…"
                  : `Send ${pending.length} file${pending.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </div>

        <QueryState
          isLoading={documents.isLoading}
          error={documents.error}
          isEmpty={rows.length === 0}
          onRetry={() => void documents.refetch()}
          empty={
            <EmptyState
              title="Nothing here yet"
              description="Files you send, and documents UZA releases to you, will be listed here with where the work on each one stands."
            />
          }
        >
          <ul className="space-y-2">
            {rows.map((d) => {
              const items = (activity.data ?? []).filter((a) => a.drawing_id === d.id);
              const isOpen = open === d.id;
              return (
                <li key={d.id} className="rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{d.file_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.submitted_by_client ? "Sent by you" : "Shared by UZA"} ·{" "}
                        {new Date(d.created_at).toLocaleDateString("en-GB")}
                        {d.client_note ? ` · “${d.client_note}”` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {d.submitted_by_client && (
                        <Badge variant={statusVariant(d.review_status)}>
                          {reviewStatusLabel(d.review_status)}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void openFile(d.storage_path, d.file_name).catch((e: unknown) =>
                            toast.error(
                              e instanceof Error ? e.message : "Could not open that file.",
                            ),
                          )
                        }
                      >
                        <Download className="size-4" aria-hidden />
                        <span className="sr-only">Download {d.file_name}</span>
                      </Button>
                      {d.submitted_by_client && d.review_status === "received" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={withdraw.isPending}
                          onClick={() => withdraw.mutate(d)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Withdraw {d.file_name}</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : d.id)}
                      >
                        Progress ({items.length})
                        {isOpen ? (
                          <ChevronUp className="size-4" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t p-3">
                      <DocumentTimeline
                        drawingId={d.id}
                        projectId={projectId}
                        activity={items}
                        mode="client"
                        queryKey={activityKey}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}
