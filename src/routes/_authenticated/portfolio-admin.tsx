/**
 * Staff-side portfolio manager.
 *
 * Publishing is deliberate and two-staged: an entry is invisible until
 * "Published" is switched on, and the client is named only when consent has
 * been recorded here. Restricted to Admin and Project Manager by RLS.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PACKAGE_CATEGORIES, QUALITY_TIERS, categoryLabel } from "@/config/packages";
import {
  PROJECT_TYPES,
  deleteEntry,
  listAllEntries,
  upsertEntry,
  type PortfolioEntry,
} from "@/services/portfolioService";

export const Route = createFileRoute("/_authenticated/portfolio-admin")({
  head: () => ({
    meta: [
      { title: "Portfolio manager — UZA Build" },
      { name: "description", content: "Publish delivered and ongoing projects to the public UZA Build portfolio." },
      { property: "og:title", content: "Portfolio manager — UZA Build" },
      { property: "og:description", content: "Publish reference projects with recorded client consent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortfolioManager,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
}

function PortfolioManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<PortfolioEntry> | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portfolio", "all"],
    queryFn: listAllEntries,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing?.title) throw new Error("A title is required.");
      await upsertEntry({
        ...editing,
        title: editing.title,
        slug: editing.slug || slugify(editing.title),
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => {
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleFamily(key: string) {
    const current = editing?.product_families ?? [];
    setEditing({
      ...editing,
      product_families: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Portfolio</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Nothing is public until you publish it, and a client is named only where you record their consent.
          </p>
        </div>
        <Button onClick={() => setEditing({ status: "ongoing", country: "Rwanda", product_families: [] })}>
          <Plus className="size-4" /> New entry
        </Button>
      </header>

      {editing && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Public address</Label>
                <Input
                  id="slug"
                  placeholder={editing.title ? slugify(editing.title) : "auto"}
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">Client name</Label>
                <Input
                  id="client"
                  value={editing.client_display_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, client_display_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={editing.location ?? ""}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Project type</Label>
                <Select
                  value={editing.project_type ?? "other"}
                  onValueChange={(v) => setEditing({ ...editing, project_type: v })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={editing.status ?? "ongoing"}
                  onValueChange={(v) => setEditing({ ...editing, status: v as PortfolioEntry["status"] })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  className="tabular"
                  value={editing.year ?? ""}
                  onChange={(e) => setEditing({ ...editing, year: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tier">Quality tier</Label>
                <Select
                  {...(editing.quality_tier ? { value: editing.quality_tier } : {})}
                  onValueChange={(v) => setEditing({ ...editing, quality_tier: v })}
                >
                  <SelectTrigger id="tier">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_TIERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cover">Cover image address</Label>
                <Input
                  id="cover"
                  placeholder="https://…"
                  value={editing.cover_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gallery">Gallery image addresses (one per line)</Label>
                <Textarea
                  id="gallery"
                  rows={3}
                  value={(editing.gallery_urls ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      gallery_urls: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="summary">Short summary</Label>
                <Textarea
                  id="summary"
                  rows={2}
                  value={editing.summary ?? ""}
                  onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="scope">Scope</Label>
                <Textarea
                  id="scope"
                  rows={5}
                  value={editing.scope ?? ""}
                  onChange={(e) => setEditing({ ...editing, scope: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Product families supplied</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {PACKAGE_CATEGORIES.map((c) => {
                  const on = (editing.product_families ?? []).includes(c.key);
                  return (
                    <Button
                      key={c.key}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleFamily(c.key)}
                    >
                      {c.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
              <label className="flex items-start gap-3">
                <Switch
                  checked={Boolean(editing.client_consented)}
                  onCheckedChange={(v) => setEditing({ ...editing, client_consented: v })}
                />
                <span className="text-sm">
                  Client consented to be named
                  <span className="block text-xs text-muted-foreground">
                    Off: the project shows as “Client withheld”.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Switch
                  checked={Boolean(editing.is_published)}
                  onCheckedChange={(v) => setEditing({ ...editing, is_published: v })}
                />
                <span className="text-sm">
                  Published publicly
                  <span className="block text-xs text-muted-foreground">Off: visible to the team only.</span>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save entry"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">The portfolio could not be loaded.</p>
            <p className="mt-2 text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (data ?? []).length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="font-medium">No portfolio entries yet</p>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Add a delivered or ongoing project here. It stays private to the team until you publish it, and the client
              is only named once you record their consent.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(data ?? []).map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{e.title}</p>
                  <Badge variant={e.is_published ? "default" : "outline"} className="font-mono text-[10px] uppercase">
                    {e.is_published ? "Published" : "Draft"}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {e.status}
                  </Badge>
                  {!e.client_consented && (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      Client withheld
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  /{e.slug}
                  {e.product_families.length > 0 && ` · ${e.product_families.map(categoryLabel).join(" · ")}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
