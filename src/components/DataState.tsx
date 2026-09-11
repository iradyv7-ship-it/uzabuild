import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Skeleton placeholder — never a bare spinner. */
export function LoadingRows({ rows = 4, className }: { rows?: number | undefined; className?: string | undefined }) {
  return (
    <div className={className ?? "space-y-2"} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  /** Describe what WILL appear here. Never fake sample content. */
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Inbox className="size-8 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: (() => void) | undefined }) {
  const message = error instanceof Error ? error.message : "Something went wrong loading this data.";
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="size-7 text-destructive" aria-hidden />
        <div>
          <p className="font-medium text-destructive">Could not load</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** One wrapper for the loading / error / empty / ready cycle. */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  empty,
  onRetry,
  rows,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean | undefined;
  empty?: ReactNode | undefined;
  onRetry?: (() => void) | undefined;
  rows?: number | undefined;
  children: ReactNode;
}) {
  if (isLoading) return <LoadingRows rows={rows} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
