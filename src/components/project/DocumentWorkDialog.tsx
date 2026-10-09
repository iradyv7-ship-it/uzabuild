import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, LockOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { roleLabel, type AppRole } from "@/constants/roles";
import { DocumentTimeline } from "@/components/portal/DocumentTimeline";
import {
  GRANTABLE_ROLES,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
  grantAccess,
  listAccessGrants,
  listDocumentActivity,
  listProjectMembers,
  revokeAccess,
  setDocumentRestricted,
  setReviewStatus,
  type ReviewStatus,
} from "@/services/clientWorkspaceService";

export type WorkDocument = {
  id: string;
  file_name: string;
  submitted_by_client: boolean;
  access_restricted: boolean;
  review_status: string | null;
  client_note: string | null;
};

/**
 * One document from the team's side: who may read it, where the review
 * stands, and the timeline of work on it. Only a project lead (owner,
 * project manager, admin) can route access — the database refuses anyone
 * else, whatever this dialog shows.
 */
export function DocumentWorkDialog({
  projectId,
  doc,
  isLead,
  onClose,
}: {
  projectId: string;
  doc: WorkDocument;
  isLead: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [grantTarget, setGrantTarget] = useState<string>("");

  const grantsKey = ["document-grants", projectId] as const;
  const activityKey = ["document-activity", projectId] as const;
  const grants = useQuery({ queryKey: grantsKey, queryFn: () => listAccessGrants(projectId) });
  const members = useQuery({
    queryKey: ["project-members-grantable", projectId],
    queryFn: () => listProjectMembers(projectId),
    enabled: isLead,
  });
  const activity = useQuery({
    queryKey: activityKey,
    queryFn: () => listDocumentActivity(projectId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: grantsKey });
    void queryClient.invalidateQueries({ queryKey: activityKey });
    void queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "That did not work.");

  const status = useMutation({
    mutationFn: (s: ReviewStatus) => setReviewStatus(doc.id, s),
    onSuccess: () => {
      toast.success("Status updated. The client sees it on their project page.");
      refresh();
    },
    onError: fail,
  });

  const restrict = useMutation({
    mutationFn: (restricted: boolean) => setDocumentRestricted(doc.id, restricted),
    onSuccess: refresh,
    onError: fail,
  });

  const grant = useMutation({
    mutationFn: (target: string) => {
      const [kind, value] = target.split(":");
      return grantAccess({
        drawingId: doc.id,
        projectId,
        role: kind === "role" ? (value as AppRole) : undefined,
        userId: kind === "user" ? value : undefined,
      });
    },
    onSuccess: () => {
      setGrantTarget("");
      toast.success("Access granted. Their assistant can now read this document too.");
      refresh();
    },
    onError: fail,
  });

  const revoke = useMutation({ mutationFn: revokeAccess, onSuccess: refresh, onError: fail });

  const docGrants = (grants.data ?? []).filter((g) => g.drawing_id === doc.id);
  const memberName = (id: string) =>
    (members.data ?? []).find((m) => m.user_id === id)?.name ?? "Team member";
  const people = [
    ...new Map(
      (members.data ?? [])
        .filter((m) => m.role !== "client" && m.role !== "manufacturer")
        .map((m) => [m.user_id, m]),
    ).values(),
  ];
  const items = (activity.data ?? []).filter((a) => a.drawing_id === doc.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-all">{doc.file_name}</DialogTitle>
          <DialogDescription>
            {doc.submitted_by_client ? "Submitted by the client." : "Uploaded by the team."}
            {doc.client_note ? ` Client's note: “${doc.client_note}”` : ""}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Who can read it</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {doc.access_restricted ? (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" aria-hidden /> Restricted — leads and the people below
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <LockOpen className="size-3" aria-hidden /> Whole project team
              </Badge>
            )}
            {isLead && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={restrict.isPending}
                onClick={() => restrict.mutate(!doc.access_restricted)}
              >
                {doc.access_restricted ? "Open to the whole team" : "Restrict"}
              </Button>
            )}
          </div>

          {doc.access_restricted && (
            <>
              {docGrants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody has been granted this yet
                  {isLead ? " — route it to a discipline seat or a person below." : "."}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {docGrants.map((g) => (
                    <li key={g.id}>
                      <Badge variant="secondary" className="gap-1">
                        {g.grantee_role
                          ? `${roleLabel(g.grantee_role)} seat`
                          : memberName(g.grantee_user_id!)}
                        {isLead && (
                          <button
                            type="button"
                            className="ml-1 rounded-sm hover:text-destructive"
                            onClick={() => revoke.mutate(g.id)}
                            aria-label="Remove access"
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                        )}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {isLead && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-56 flex-1 space-y-1">
                    <Label>Grant access to</Label>
                    <Select value={grantTarget} onValueChange={setGrantTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder="A discipline seat or a person" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRANTABLE_ROLES.map((r) => (
                          <SelectItem key={r} value={`role:${r}`}>
                            Every {roleLabel(r)} on the project
                          </SelectItem>
                        ))}
                        {people.map((m) => (
                          <SelectItem key={m.user_id} value={`user:${m.user_id}`}>
                            {m.name} ({roleLabel(m.role)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!grantTarget || grant.isPending}
                    onClick={() => grant.mutate(grantTarget)}
                  >
                    Grant
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {doc.submitted_by_client && (
          <>
            <Separator />
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Review status (shown to the client)</h3>
              <Select
                value={doc.review_status ?? "received"}
                onValueChange={(v) => status.mutate(v as ReviewStatus)}
                disabled={status.isPending}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {REVIEW_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          </>
        )}

        <Separator />
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Work on this document</h3>
          <DocumentTimeline
            drawingId={doc.id}
            projectId={projectId}
            activity={items}
            mode="team"
            queryKey={activityKey}
          />
        </section>
      </DialogContent>
    </Dialog>
  );
}
