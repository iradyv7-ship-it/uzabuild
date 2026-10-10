/**
 * Public portfolio index.
 *
 * Only entries someone has explicitly published appear here, and the client is
 * named only where consent was recorded. Nothing is invented: if no project has
 * been published yet, the page says so plainly.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, ImageOff } from "lucide-react";
import { SiteShell, SectionLabel } from "@/components/marketing/SiteChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabel } from "@/config/packages";
import { displayClient, listPublishedEntries, projectTypeLabel } from "@/services/portfolioService";

export const Route = createFileRoute("/portfolio/")({
  head: () => ({
    meta: [
      { title: "Portfolio — UZA Build finishing solutions" },
      {
        name: "description",
        content:
          "Reference projects finished by UZA Build: conference halls, hotels, apartments and residences. Published only where the client has consented.",
      },
      { property: "og:title", content: "Portfolio — UZA Build finishing solutions" },
      {
        property: "og:description",
        content: "Reference projects finished by UZA Build, published only with client consent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioIndex,
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
] as const;

function PortfolioIndex() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portfolio", "published"],
    queryFn: listPublishedEntries,
  });

  const entries = useMemo(
    () => (data ?? []).filter((e) => filter === "all" || e.status === filter),
    [data, filter],
  );

  return (
    <SiteShell>
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-16">
        <SectionLabel index="01">Delivered work</SectionLabel>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] md:text-6xl">
          Projects we have finished, and projects we are finishing now.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          A project appears here only once it is published by our team, and a client is named only where that client has
          given consent. Where consent was not given, the work is shown without attribution.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        {isLoading && (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-[4/3] w-full rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/40 p-8">
            <p className="text-sm font-medium">The portfolio could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="font-display text-lg font-semibold">No published projects yet</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Completed and ongoing projects appear here once our team publishes them and the client has confirmed how
              they wish to be credited. Nothing is placed here automatically.
            </p>
          </div>
        )}

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <Link
              key={e.id}
              to="/portfolio/$slug"
              params={{ slug: e.slug }}
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                {e.cover_url ? (
                  <img
                    src={e.cover_url}
                    alt={e.title}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="size-5" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Photography pending</span>
                  </div>
                )}
                <Badge
                  variant={e.status === "completed" ? "secondary" : "outline"}
                  className="absolute left-3 top-3 bg-background/90 font-mono text-[10px] uppercase tracking-[0.16em]"
                >
                  {e.status}
                </Badge>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-base font-semibold leading-snug">{e.title}</h2>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground tabular">
                {projectTypeLabel(e.project_type)} · {e.location ?? e.country}
                {e.year ? ` · ${e.year}` : ""}
              </p>
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{e.summary}</p>
              {e.product_families.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {e.product_families.slice(0, 3).map(categoryLabel).join(" · ")}
                  {e.product_families.length > 3 ? ` +${e.product_families.length - 3}` : ""}
                </p>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {displayClient(e)}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
