import { Check, Circle, Dot } from "lucide-react";
import { PROJECT_STAGES, type ProjectStageKey } from "@/config/policy";
import { cn } from "@/lib/utils";

export function stageIndex(stage: string): number {
  const i = PROJECT_STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? 0 : i;
}

export function stageLabel(stage: string): string {
  return PROJECT_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export function StageMachine({
  current,
  onSelect,
  disabled,
}: {
  current: string;
  onSelect?: ((stage: ProjectStageKey) => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const currentIdx = stageIndex(current);

  return (
    <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {PROJECT_STAGES.map((stage, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const Icon = done ? Check : active ? Circle : Dot;
        const content = (
          <>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>
              <span className="tabular mr-1 text-xs">{String(i + 1).padStart(2, "0")}</span>
              {stage.label}
            </span>
          </>
        );

        return (
          <li key={stage.key}>
            {onSelect && !disabled ? (
              <button
                type="button"
                onClick={() => onSelect(stage.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-current={active ? "step" : undefined}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5" aria-current={active ? "step" : undefined}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
