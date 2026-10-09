import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  postDocumentActivity,
  reviewStatusLabel,
  type DocumentActivity,
} from "@/services/clientWorkspaceService";

function describe(a: DocumentActivity): string {
  switch (a.kind) {
    case "received":
      return a.body ?? "Received.";
    case "status":
      return `Status changed to "${reviewStatusLabel(a.status)}".`;
    case "access_granted":
      return `Access granted to ${a.body ?? "a team member"}.`;
    case "access_revoked":
      return `Access removed from ${a.body ?? "a team member"}.`;
    default:
      return a.body ?? "";
  }
}

/**
 * The work recorded against one document, oldest first, with a box to add to
 * it. The database decides what each side sees: a client never receives an
 * internal-only row, and can only post comments.
 */
export function DocumentTimeline({
  drawingId,
  projectId,
  activity,
  mode,
  queryKey,
}: {
  drawingId: string;
  projectId: string;
  activity: DocumentActivity[];
  mode: "client" | "team";
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [clientVisible, setClientVisible] = useState(true);

  const post = useMutation({
    mutationFn: () =>
      postDocumentActivity({
        drawingId,
        projectId,
        kind: mode === "client" ? "comment" : "update",
        body,
        clientVisible: mode === "client" ? true : clientVisible,
      }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not post that."),
  });

  return (
    <div className="space-y-3">
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded on this document yet.</p>
      ) : (
        <ol className="space-y-2 border-l pl-4">
          {activity.map((a) => (
            <li key={a.id} className="relative text-sm">
              <span
                className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary"
                aria-hidden
              />
              <p>
                {describe(a)}
                {mode === "team" && !a.client_visible && (
                  <span className="ml-2 text-xs text-muted-foreground">(internal only)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.actor_name ?? "UZA"} ·{" "}
                {new Date(a.created_at).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          post.mutate();
        }}
      >
        <Label htmlFor={`timeline-${drawingId}`} className="sr-only">
          {mode === "client" ? "Comment" : "Progress update"}
        </Label>
        <Textarea
          id={`timeline-${drawingId}`}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            mode === "client"
              ? "Ask a question or add context for the team…"
              : "Record what was done, what is next, or what you need from the client…"
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {mode === "team" ? (
            <div className="flex items-center gap-2">
              <Switch
                id={`visible-${drawingId}`}
                checked={clientVisible}
                onCheckedChange={setClientVisible}
              />
              <Label htmlFor={`visible-${drawingId}`} className="text-xs font-normal">
                Client can see this update
              </Label>
            </div>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={post.isPending || !body.trim()}>
            {post.isPending ? "Posting…" : mode === "client" ? "Send comment" : "Post update"}
          </Button>
        </div>
      </form>
    </div>
  );
}
