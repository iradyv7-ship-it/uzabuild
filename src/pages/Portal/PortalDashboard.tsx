import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, FileText, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, EmptyState } from "@/components/DataState";
import { StatCard } from "@/components/cards/StatCard";
import { PortalRateCard } from "@/components/portal/PortalRateCard";
import { PROJECT_STAGES } from "@/config/policy";
import { roleLabel } from "@/constants/roles";
import {
  listIssuedProformas,
  listPortalProjects,
  listRecentApprovals,
} from "@/services/portalService";

function stageLabel(key: string) {
  return PROJECT_STAGES.find((s) => s.key === key)?.label ?? key;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The client's dashboard. It only ever reads what the database lets a client
 * seat read: projects they were added to, formally issued proformas at the
 * agreed price, and recorded sign-offs. No catalog, rates, suppliers or margin.
 */
export function PortalDashboard() {
  const projects = useQuery({ queryKey: ["portal-projects"], queryFn: listPortalProjects });
  const proformas = useQuery({ queryKey: ["portal-all-proformas"], queryFn: listIssuedProformas });
  const approvals = useQuery({ queryKey: ["portal-all-approvals"], queryFn: () => listRecentApprovals() });

  const rows = projects.data ?? [];
  const projectName = (id: string) => rows.find((p) => p.id === id)?.name ?? "Project";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Your dashboard</h1>
        <p className="text-muted-foreground">
          Everything UZA has agreed with you: where each project stands, who has signed it off, and
          the proformas issued to you.
        </p>
      </header>

      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderKanban} label="Projects" value={rows.length} loading={projects.isLoading} />
        <StatCard
          icon={FileText}
          label="Proformas issued"
          value={proformas.data?.length ?? 0}
          loading={proformas.isLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label="Sign-offs recorded"
          value={approvals.data?.length ?? 0}
          loading={approvals.isLoading}
        />
        <PortalRateCard />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Projects</h2>
        <QueryState
          isLoading={projects.isLoading}
          error={projects.error}
          isEmpty={rows.length === 0}
          onRetry={() => void projects.refetch()}
          empty={
            <EmptyState
              title="No project shared with you yet"
              description="When UZA adds you to a project, it will appear here with its current stage, the sign-offs recorded against it and any proforma issued to you."
            />
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((p) => (
              <Link
                key={p.id}
                to="/portal/$projectId"
                params={{ projectId: p.id }}
                className="block rounded-lg transition hover:opacity-90"
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3 text-base">
                      {p.name}
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                    </CardTitle>
                    <CardDescription>{p.location || p.client_name || "—"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary">Stage: {stageLabel(p.current_stage)}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </QueryState>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proformas issued to you</CardTitle>
            <CardDescription>Only documents UZA has formally issued, at the agreed price.</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={proformas.isLoading}
              error={proformas.error}
              isEmpty={(proformas.data?.length ?? 0) === 0}
              onRetry={() => void proformas.refetch()}
              empty={
                <EmptyState
                  title="No proforma issued yet"
                  description="When UZA issues a proforma you will be able to open and print it from your project page."
                />
              }
            >
              <ul className="space-y-2">
                {(proformas.data ?? []).map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/portal/$projectId"
                      params={{ projectId: p.project_id }}
                      className="block rounded-md border p-3 transition hover:bg-accent/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="tabular font-medium">{p.reference}</span>
                        <Badge variant={p.signed_by_name ? "default" : "secondary"}>
                          {p.signed_by_name ? "Signed" : "Issued"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {p.title} · {projectName(p.project_id)}
                        {p.issued_at ? ` · ${new Date(p.issued_at).toLocaleDateString("en-GB")}` : ""}
                      </p>
                      {p.signed_by_name && (
                        <p className="text-sm text-muted-foreground">
                          Signed by {p.signed_by_name}
                          {p.signed_by_title ? `, ${p.signed_by_title}` : ""}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </QueryState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sign-offs</CardTitle>
            <CardDescription>
              Each stage is signed by the specialist responsible for it, with name and time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={approvals.isLoading}
              error={approvals.error}
              isEmpty={(approvals.data?.length ?? 0) === 0}
              onRetry={() => void approvals.refetch()}
              empty={
                <EmptyState
                  title="No sign-off recorded yet"
                  description="As UZA's team signs each stage of your project, the signatory, role and time will be listed here."
                />
              }
            >
              <ul className="space-y-2">
                {(approvals.data ?? []).map((a) => (
                  <li key={a.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{stageLabel(a.stage)}</span>
                      <Badge variant="outline">{roleLabel(a.role)}</Badge>
                    </div>
                    <p className="tabular text-sm text-muted-foreground">
                      {a.approver_name ?? "UZA team member"} · {when(a.approved_at)} ·{" "}
                      {projectName(a.project_id)}
                    </p>
                  </li>
                ))}
              </ul>
            </QueryState>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
