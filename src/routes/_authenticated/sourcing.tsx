import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState, EmptyState } from "@/components/DataState";
import { categoryLabel, packageStatusLabel, tierLabel } from "@/config/packages";
import { listAllPackages, listAllRequirements, readiness } from "@/services/packageService";

export const Route = createFileRoute("/_authenticated/sourcing")({
  head: () => ({
    meta: [
      { title: "Sourcing board — UZA Build" },
      {
        name: "description",
        content:
          "Every product package across every live project, by phase and priority, with what is still blocking each one.",
      },
      { property: "og:title", content: "Sourcing board — UZA Build" },
      {
        property: "og:description",
        content: "All product packages across live projects by phase, priority and readiness.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcingBoard,
});

function SourcingBoard() {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("all");
  const [state, setState] = useState("all");

  const packages = useQuery({ queryKey: ["all-packages"], queryFn: listAllPackages });
  const requirements = useQuery({ queryKey: ["all-package-requirements"], queryFn: listAllRequirements });

  const rows = (packages.data ?? [])
    .map((pkg) => {
      const r = readiness((requirements.data ?? []).filter((x) => x.package_id === pkg.id));
      return { pkg, r };
    })
    .filter(({ pkg, r }) => {
      const q = search.trim().toLowerCase();
      const matches =
        !q ||
        [pkg.title, pkg.package_code, pkg.projects?.name, pkg.projects?.project_code, categoryLabel(pkg.category)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const phaseOk = phase === "all" || String(pkg.phase) === phase;
      const stateOk = state === "all" || (state === "ready" ? r.ready : !r.ready);
      return matches && phaseOk && stateOk;
    })
    .sort(
      (a, b) =>
        a.pkg.phase - b.pkg.phase ||
        a.pkg.priority - b.pkg.priority ||
        a.r.blockers.length - b.r.blockers.length,
    );

  const blocked = rows.filter(({ r }) => !r.ready).length;
  const phases = Array.from(new Set((packages.data ?? []).map((p) => p.phase))).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Sourcing board</h1>
        <p className="mt-1 text-muted-foreground">
          Every product package across every live project, ordered by phase and priority — so four
          urgent projects can be worked in one pass instead of four conversations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What is holding production back</CardTitle>
          <CardDescription>
            A package is only released to a factory once its blocking items are on the record. This is
            the single list of what is still missing, whoever owns it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Packages</p>
            <p className="tabular mt-1 text-2xl font-semibold">{rows.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Waiting on information</p>
            <p className="tabular mt-1 text-2xl font-semibold">{blocked}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Ready to source</p>
            <p className="tabular mt-1 text-2xl font-semibold">{rows.length - blocked}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Input
          className="min-w-[16rem] flex-1"
          placeholder="Search by project, package or product family"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search packages"
        />
        <Select value={phase} onValueChange={setPhase}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All phases</SelectItem>
            {phases.map((p) => (
              <SelectItem key={p} value={String(p)}>
                Phase {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ready and blocked</SelectItem>
            <SelectItem value="blocked">Waiting on information</SelectItem>
            <SelectItem value="ready">Ready to source</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <QueryState
        isLoading={packages.isLoading || requirements.isLoading}
        error={packages.error ?? requirements.error}
        isEmpty={rows.length === 0}
        onRetry={() => void packages.refetch()}
        empty={
          <EmptyState
            title="No packages match"
            description="Packages are created inside a project, on its Packages tab. Each one appears here with its phase, priority and what is still missing."
          />
        }
      >
        <ul className="space-y-3">
          {rows.map(({ pkg, r }) => (
            <li key={pkg.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="tabular text-xs text-muted-foreground">
                    {pkg.projects?.project_code ?? "—"} · {pkg.package_code ?? "—"}
                  </p>
                  <p className="mt-1 font-medium">{pkg.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {pkg.projects?.name} · {categoryLabel(pkg.category)} · {tierLabel(pkg.quality_tier)}
                    {pkg.required_delivery_date
                      ? ` · on site ${new Date(pkg.required_delivery_date).toLocaleDateString("en-GB")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="tabular">
                    Phase {pkg.phase}
                  </Badge>
                  <Badge variant="outline" className="tabular">
                    Priority {pkg.priority}
                  </Badge>
                  <Badge variant="secondary">{packageStatusLabel(pkg.status)}</Badge>
                  {r.ready ? (
                    <Badge className="gap-1">
                      <CheckCircle2 className="size-3" aria-hidden /> Ready
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 tabular">
                      <AlertTriangle className="size-3" aria-hidden /> {r.blockers.length} blocking
                    </Badge>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/projects/$projectId" params={{ projectId: pkg.project_id }}>
                      Open <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
              {!r.ready && (
                <p className="mt-2 text-sm text-muted-foreground">Still needed: {r.blockers.join("; ")}.</p>
              )}
            </li>
          ))}
        </ul>
      </QueryState>
    </div>
  );
}
