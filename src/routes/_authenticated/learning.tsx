import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState, EmptyState } from "@/components/DataState";
import { formatQuantity } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/learning")({
  head: () => ({
    meta: [
      { title: "Takeoff accuracy — UZA Build" },
      {
        name: "description",
        content: "AI draft versus approved final quantities by material category, measured from real reviewer corrections.",
      },
      { property: "og:title", content: "Takeoff accuracy — UZA Build" },
      {
        property: "og:description",
        content: "AI draft versus approved final quantities by material category, measured from real reviewer corrections.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearningPage,
});

type Correction = {
  id: string;
  material_category: string | null;
  before_value: number | string | null;
  after_value: number | string | null;
  reason: string;
  created_at: string;
};

function LearningPage() {
  const corrections = useQuery({
    queryKey: ["corrections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("takeoff_corrections")
        .select("id, material_category, before_value, after_value, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Correction[];
    },
  });

  const rows = useMemo(() => corrections.data ?? [], [corrections.data]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { n: number; errorSum: number; accepted: number }>();
    for (const c of rows) {
      const key = c.material_category ?? "Uncategorised";
      const before = c.before_value === null ? null : Number(c.before_value);
      const after = c.after_value === null ? null : Number(c.after_value);
      const entry = map.get(key) ?? { n: 0, errorSum: 0, accepted: 0 };
      entry.n += 1;
      if (before !== null && after !== null && after !== 0) {
        const err = Math.abs(after - before) / Math.abs(after);
        entry.errorSum += err;
        if (err < 0.001) entry.accepted += 1;
      }
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        reviews: v.n,
        acceptedAsDrafted: v.accepted,
        meanErrorPct: v.n === 0 ? 0 : (v.errorSum / v.n) * 100,
      }))
      .sort((a, b) => b.reviews - a.reviews);
  }, [rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <Brain className="size-7 text-primary" aria-hidden /> Takeoff accuracy
        </h1>
        <p className="mt-1 text-muted-foreground">
          Measured only from real reviewer corrections. Nothing on this page is simulated — if a category has no
          reviews, it does not appear.
        </p>
      </header>

      <QueryState
        isLoading={corrections.isLoading}
        error={corrections.error}
        isEmpty={rows.length === 0}
        onRetry={() => void corrections.refetch()}
        empty={
          <EmptyState
            title="No reviewed takeoff lines yet"
            description="As specialists accept or correct AI-drafted quantities, this page will show mean draft-versus-final error by material category, and how often the draft was accepted unchanged."
          />
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By material category</CardTitle>
            <CardDescription>
              Mean error is the average gap between the AI draft and the value the reviewer approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                  <TableHead className="text-right">Accepted as drafted</TableHead>
                  <TableHead className="text-right">Mean error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="font-medium capitalize">{c.category}</TableCell>
                    <TableCell className="tabular text-right">{c.reviews}</TableCell>
                    <TableCell className="tabular text-right">{c.acceptedAsDrafted}</TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(c.meanErrorPct)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent corrections</CardTitle>
            <CardDescription>Before, after and the reason given — the raw training signal.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Draft</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 25).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{c.material_category ?? "Uncategorised"}</TableCell>
                    <TableCell className="tabular text-right">
                      {c.before_value === null ? "—" : formatQuantity(Number(c.before_value))}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {c.after_value === null ? "—" : formatQuantity(Number(c.after_value))}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">{c.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </QueryState>
    </div>
  );
}
