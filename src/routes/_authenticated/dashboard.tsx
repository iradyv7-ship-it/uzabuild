import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Package, FileCheck2, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, SEAT_ROLES, useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — UZA Build" },
      { name: "description", content: "Your projects, catalog and sign-offs across the UZA Build pipeline." },
      { property: "og:title", content: "Dashboard — UZA Build" },
      { property: "og:description", content: "Your projects, catalog and sign-offs across the UZA Build pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { fullName, roles, isCostBlind } = useAuth();
  if (isCostBlind) return <Navigate to="/portal" replace />;

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [projects, items, approvals, training] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("catalog_items").select("id", { count: "exact", head: true }),
        supabase.from("approvals").select("id", { count: "exact", head: true }),
        supabase.from("training_records").select("id", { count: "exact", head: true }),
      ]);
      return {
        projects: projects.count ?? 0,
        items: items.count ?? 0,
        approvals: approvals.count ?? 0,
        training: training.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Projects", value: counts?.projects ?? 0, icon: FolderKanban, to: "/projects" },
    { label: "Catalog items", value: counts?.items ?? 0, icon: Package, to: "/catalog" },
    { label: "Sign-offs recorded", value: counts?.approvals ?? 0, icon: FileCheck2, to: "/projects" },
    { label: "Training records", value: counts?.training ?? 0, icon: Brain, to: "/projects" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Good to see you{fullName ? `, ${fullName.split(" ")[0]}` : ""}</h1>
        <p className="mt-2 text-muted-foreground">
          Drawings in, an honest BOQ out. The AI drafts; you own the judgment and the sign-off.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to}>
            <Card className="h-full transition-colors hover:border-accent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="size-4 text-accent" />
              </CardHeader>
              <CardContent>
                <p className="tabular text-3xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The four seats</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {SEAT_ROLES.map((r) => (
            <div key={r} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{ROLE_LABELS[r]}</p>
                {roles.includes(r) && <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">Your seat</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{SEAT_BLURB[r]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button asChild>
          <Link to="/projects">Go to projects</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/catalog">Open the catalog</Link>
        </Button>
      </div>
    </div>
  );
}

const SEAT_BLURB: Record<string, string> = {
  architect: "Validates the drawing read: spaces, areas, levels.",
  qs: "Owns the BOQ: quantities, measurement method, wastage, final numbers.",
  interior_designer: "Owns material selection and finishes, room by room.",
  mep_engineer: "Owns electrical, plumbing, HVAC, structure and solar sizing.",
};
