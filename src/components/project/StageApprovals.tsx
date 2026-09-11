import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileCheck2, Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QueryState } from "@/components/DataState";
import { PROJECT_STAGES, STAGE_REQUIRED_ROLES, type ProjectStageKey } from "@/config/policy";
import { ROLE_LABELS, useAuth, type AppRole } from "@/context/AuthContext";
import { stageIndex, stageLabel } from "@/components/project/StageMachine";
import { cn } from "@/lib/utils";

type Approval = {
  id: string;
  role: string;
  stage: string;
  approver_name: string | null;
  notes: string | null;
  approved_at: string;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The stage gate.
 *
 * A project moves forward one stage at a time, and only once every seat that
 * owes a sign-off on the stages behind it has actually signed — with a name and
 * a timestamp against it. The same rule is enforced in the database, so this
 * screen cannot be talked around.
 */
export function StageApprovals({
  projectId,
  currentStage,
}: {
  projectId: string;
  currentStage: string;
}) {
  const queryClient = useQueryClient();
  const { user, roles, fullName } = useAuth();
  const isAdmin = roles.includes("admin");

  const approvals = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("id, role, stage, approver_name, notes, approved_at")
        .eq("project_id", projectId)
        .order("approved_at", { ascending: false });
      if (error) throw error;
      return data as Approval[];
    },
  });

  const rows = approvals.data ?? [];
  const currentIdx = stageIndex(currentStage);
  const nextStage = PROJECT_STAGES[currentIdx + 1];

  const approvalFor = (stage: string, role: string) =>
    rows.find((a) => a.stage === stage && a.role === role) ?? null;
  const stageComplete = (stage: ProjectStageKey) =>
    STAGE_REQUIRED_ROLES[stage].every((role) => approvalFor(stage, role) !== null);

  const blocking = PROJECT_STAGES.slice(0, currentIdx + 1).filter((s) => !stageComplete(s.key));
  const canAdvance = blocking.length === 0 && Boolean(nextStage);

  const approve = useMutation({
    mutationFn: async (v: { role: AppRole; stage: string; notes: string }) => {
      const { error } = await supabase.from("approvals").insert({
        project_id: projectId,
        role: v.role,
        stage: v.stage,
        approved_by: user!.id,
        approver_name: fullName || user!.email || null,
        notes: v.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sign-off recorded against your name and the time it happened.");
      void queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error && e.message.includes("duplicate")
          ? "That seat has already signed this stage off."
          : e instanceof Error
            ? e.message
            : "Could not record that sign-off.",
      ),
  });

  const move = useMutation({
    mutationFn: async (stage: ProjectStageKey) => {
      const { error } = await supabase
        .from("projects")
        .update({ current_stage: stage })
        .eq("id", projectId);
      if (error) throw error;
      const { error: eventError } = await supabase.from("project_stage_events").insert({
        project_id: projectId,
        stage,
        entered_by: user?.id ?? null,
      });
      if (eventError) throw eventError;
    },
    onSuccess: () => {
      toast.success("Stage updated.");
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["stage-events", projectId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not move this project."),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client journey</CardTitle>
          <CardDescription>
            Currently at{" "}
            <span className="font-medium text-foreground">{stageLabel(currentStage)}</span>. A
            project moves forward one stage at a time, only once every sign-off behind it is
            recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => nextStage && move.mutate(nextStage.key)}
              disabled={!canAdvance || move.isPending || !nextStage}
            >
              {nextStage ? `Move to ${nextStage.label}` : "Project is at handover"}
              <ArrowRight className="size-4" />
            </Button>
            {currentIdx > 0 && (
              <Button
                variant="outline"
                onClick={() => move.mutate(PROJECT_STAGES[currentIdx - 1]!.key)}
                disabled={move.isPending}
              >
                <Undo2 className="size-4" /> Step back to {PROJECT_STAGES[currentIdx - 1]!.label}
              </Button>
            )}
          </div>
          {blocking.length > 0 && nextStage && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Waiting on{" "}
              {blocking
                .map(
                  (s) =>
                    `${s.label} (${STAGE_REQUIRED_ROLES[s.key]
                      .filter((r) => approvalFor(s.key, r) === null)
                      .map((r) => ROLE_LABELS[r as AppRole])
                      .join(", ")})`,
                )
                .join("; ")}
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-accent" aria-hidden /> Sign-off record
          </CardTitle>
          <CardDescription>
            Every stage lists the seats that must sign it, who signed and when. You can only sign in
            a seat you hold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={approvals.isLoading}
            error={approvals.error}
            onRetry={() => void approvals.refetch()}
          >
            <ol className="space-y-3">
              {PROJECT_STAGES.map((stage, i) => {
                const done = stageComplete(stage.key);
                const isCurrent = i === currentIdx;
                const openForSigning = i <= currentIdx;
                return (
                  <li
                    key={stage.key}
                    className={cn(
                      "rounded-lg border p-4",
                      isCurrent ? "border-primary" : "border-border",
                      i > currentIdx && "opacity-60",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        <span className="tabular mr-2 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {stage.label}
                      </p>
                      {done ? (
                        <Badge className="gap-1">
                          <Check className="size-3" aria-hidden /> Signed off
                        </Badge>
                      ) : (
                        <Badge variant={isCurrent ? "outline" : "secondary"}>
                          {isCurrent
                            ? "Awaiting sign-off"
                            : i < currentIdx
                              ? "Outstanding"
                              : "Not started"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {STAGE_REQUIRED_ROLES[stage.key].map((role) => {
                        const record = approvalFor(stage.key, role);
                        const mine = roles.includes(role as AppRole) || isAdmin;
                        return (
                          <div key={role} className="rounded-md bg-muted/50 p-3 text-sm">
                            <p className="font-medium">{ROLE_LABELS[role as AppRole]}</p>
                            {record ? (
                              <>
                                <p className="text-xs text-muted-foreground">
                                  {record.approver_name || "Unnamed user"} ·{" "}
                                  {when(record.approved_at)}
                                </p>
                                {record.notes && <p className="mt-1 text-xs">{record.notes}</p>}
                              </>
                            ) : openForSigning && mine ? (
                              <SignOffDialog
                                stageLabelText={stage.label}
                                roleLabel={ROLE_LABELS[role as AppRole]}
                                pending={approve.isPending}
                                onSubmit={(notes) =>
                                  approve.mutate({ role: role as AppRole, stage: stage.key, notes })
                                }
                              />
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {openForSigning
                                  ? "Pending — not your seat."
                                  : "Opens when the project reaches this stage."}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function SignOffDialog({
  stageLabelText,
  roleLabel,
  pending,
  onSubmit,
}: {
  stageLabelText: string;
  roleLabel: string;
  pending: boolean;
  onSubmit: (notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-2">
          Sign off as {roleLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {stageLabelText} — {roleLabel}
          </DialogTitle>
          <DialogDescription>
            Your name and the exact time are recorded against this stage and cannot be edited
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signoff-notes">
              What are you approving, and with what reservations?
            </Label>
            <Textarea
              id="signoff-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => {
              onSubmit(notes);
              setOpen(false);
              setNotes("");
            }}
          >
            Record sign-off
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
