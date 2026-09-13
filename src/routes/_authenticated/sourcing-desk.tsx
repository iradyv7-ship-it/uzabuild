import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileText, Inbox, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, EmptyState } from "@/components/DataState";
import { useAuth } from "@/context/AuthContext";
import { packageStatusLabel } from "@/config/packages";
import {
  acknowledgeDocument,
  listPackagesNeedingSourcingReview,
  listProformasAwaitingInput,
  listUnacknowledgedDocuments,
} from "@/services/sourcingDeskService";

export const Route = createFileRoute("/_authenticated/sourcing-desk")({
  head: () => ({
    meta: [
      { title: "China sourcing desk — UZA Build" },
      {
        name: "description",
        content:
          "Every project needing sourcing attention right now — proformas awaiting input, packages ready for a factory quote, and documents not yet acknowledged.",
      },
      { property: "og:title", content: "China sourcing desk — UZA Build" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcingDesk,
});

function SourcingDesk() {
  const { user, fullName } = useAuth();
  const queryClient = useQueryClient();

  const proformas = useQuery({
    queryKey: ["sourcing-desk-proformas"],
    queryFn: listProformasAwaitingInput,
  });
  const packages = useQuery({
    queryKey: ["sourcing-desk-packages"],
    queryFn: listPackagesNeedingSourcingReview,
  });
  const documents = useQuery({
    queryKey: ["sourcing-desk-documents", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listUnacknowledgedDocuments(user!.id),
  });

  const acknowledge = useMutation({
    mutationFn: ({ drawingId, projectId }: { drawingId: string; projectId: string }) =>
      acknowledgeDocument(drawingId, projectId, user!.id),
    onSuccess: () => {
      toast.success("Marked as seen.");
      void queryClient.invalidateQueries({ queryKey: ["sourcing-desk-documents", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {fullName ? `${fullName.split(" ")[0]}'s` : "China"} sourcing desk
        </h1>
        <p className="mt-2 text-muted-foreground">
          Everything across every active project that needs your input — not just the projects you
          were individually invited to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden /> Proformas awaiting input
          </CardTitle>
          <CardDescription>Draft proformas, across every active project, not yet issued.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={proformas.isLoading}
            error={proformas.error}
            isEmpty={(proformas.data?.length ?? 0) === 0}
            onRetry={() => void proformas.refetch()}
            empty={<EmptyState title="Nothing waiting" description="Every proforma across active projects has been issued." />}
          >
            <ul className="space-y-2">
              {(proformas.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="tabular font-medium">{p.reference} — {p.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.projects?.name ?? "Unknown project"} · {p.lineCount} line(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{p.status === "draft" ? "Draft" : p.status}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/projects/$projectId" params={{ projectId: p.project_id }}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4" aria-hidden /> Packages needing a factory quote
          </CardTitle>
          <CardDescription>
            Ready to source, being sourced, or already quoted — the pipeline a proforma is eventually
            built from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={packages.isLoading}
            error={packages.error}
            isEmpty={(packages.data?.length ?? 0) === 0}
            onRetry={() => void packages.refetch()}
            empty={<EmptyState title="Nothing in the pipeline" description="No package is currently ready to source, being sourced, or quoted." />}
          >
            <ul className="space-y-2">
              {(packages.data ?? []).map((pkg) => (
                <li key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{pkg.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {pkg.projects?.name ?? "Unknown project"} · {pkg.package_code ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{packageStatusLabel(pkg.status)}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/projects/$projectId" params={{ projectId: pkg.project_id }}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="size-4" aria-hidden /> Documents not yet acknowledged
          </CardTitle>
          <CardDescription>
            Uploaded in the last 30 days by someone else (the founder, an admin, or a client) on a
            project you can see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={documents.isLoading}
            error={documents.error}
            isEmpty={(documents.data?.length ?? 0) === 0}
            onRetry={() => void documents.refetch()}
            empty={<EmptyState title="All caught up" description="Nothing new has been uploaded that you haven't already acknowledged." />}
          >
            <ul className="space-y-2">
              {(documents.data ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{d.file_name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {d.projects?.name ?? "Unknown project"} · {d.document_kind} · {new Date(d.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate({ drawingId: d.id, projectId: d.project_id })}
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Mark as seen
                  </Button>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
