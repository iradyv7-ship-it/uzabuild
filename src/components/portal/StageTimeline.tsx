import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STAGES, STAGE_REQUIRED_ROLES, type ProjectStageKey } from "@/config/policy";
import { roleLabel } from "@/constants/roles";
import { cn } from "@/lib/utils";

export type StageSignoff = {
  id: string;
  role: string;
  stage: string;
  approver_name: string | null;
  approved_at: string;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Read-only stage ladder with the sign-offs recorded against each stage. */
export function StageTimeline({
  currentStage,
  signoffs,
}: {
  currentStage: string | undefined;
  signoffs: StageSignoff[];
}) {
  const currentIndex = PROJECT_STAGES.findIndex((s) => s.key === currentStage);

  return (
    <ol className="space-y-3">
      {PROJECT_STAGES.map((stage, i) => {
        const required = STAGE_REQUIRED_ROLES[stage.key as ProjectStageKey] ?? [];
        const stageSignoffs = signoffs.filter((a) => a.stage === stage.key);
        const done = required.every((r) => stageSignoffs.some((a) => a.role === r));
        return (
          <li
            key={stage.key}
            className={cn("rounded-md border p-3", i === currentIndex && "border-primary bg-accent/40")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                {done && <Check className="size-4 text-primary" aria-hidden />}
                {stage.label}
              </span>
              <Badge variant={done ? "default" : i === currentIndex ? "secondary" : "outline"}>
                {done ? "Signed off" : i === currentIndex ? "In progress" : "Not started"}
              </Badge>
            </div>
            {stageSignoffs.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {stageSignoffs.map((a) => (
                  <li key={a.id} className="tabular">
                    {roleLabel(a.role)} — {a.approver_name ?? "UZA team member"}, {when(a.approved_at)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Awaiting sign-off by {required.map((r) => roleLabel(r)).join(", ") || "the UZA team"}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
