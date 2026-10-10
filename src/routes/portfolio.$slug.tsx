/**
 * Public case study. Reads only published entries; unpublished slugs 404.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageOff } from "lucide-react";
import { SiteShell, SectionLabel } from "@/components/marketing/SiteChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabel, tierLabel } from "@/config/packages";
import { displayClient, getPublishedEntry, projectTypeLabel } from "@/services/portfolioService";

export const Route = createFileRoute("/portfolio/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} — UZA Build portfolio` },
      { name: "description", content: "A finishing project delivered by UZA Build, published with client consent." },
      { property: "og:title", content: "UZA Build portfolio project" },
      { property: "og:description", content: "A finishing project delivered by UZA Build." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CaseStudy,
});

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border pt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm tabular">{value}</p>
    </div>
  );
}

function CaseStudy() {
  const { slug } = Route.useParams();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portfolio", slug],
    queryFn: () => getPublishedEntry(slug),
  });

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portfolio">
            <ArrowLeft className="size-4" /> All projects
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-12">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="aspect-[16/7] w-full rounded-lg" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {isError && (
        <div className="mx-auto max-w-3xl px-6 py-20">
          <p className="text-sm font-medium">This project could not be loaded.</p>
          <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !isError && !data && (
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="font-display text-xl font-semibold">This project is not published</p>
          <p className="mt-3 text-sm text-muted-foreground">
            It may still be in delivery, or the client has not agreed to it being shown publicly.
          </p>
        </div>
      )}

      {data && (
        <article className="mx-auto max-w-7xl px-6 pb-24">
          <header className="pt-8">
            <SectionLabel index={data.year ? String(data.year) : undefined}>
              {projectTypeLabel(data.project_type)}
            </SectionLabel>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] md:text-6xl">{data.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{data.summary}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant={data.status === "completed" ? "secondary" : "outline"} className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {data.status}
              </Badge>
              {data.quality_tier && (
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  {tierLabel(data.quality_tier)}
                </Badge>
              )}
            </div>
          </header>

          <div className="mt-12 overflow-hidden rounded-lg border bg-muted">
            {data.cover_url ? (
              <img src={data.cover_url} alt={data.title} className="aspect-[16/7] w-full object-cover" />
            ) : (
              <div className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="size-6" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Site photography pending</span>
              </div>
            )}
          </div>

          <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_18rem]">
            <div>
              <SectionLabel index="01">Scope</SectionLabel>
              <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {data.scope || "Scope notes for this project have not been published yet."}
              </p>

              {data.product_families.length > 0 && (
                <>
                  <div className="mt-14" />
                  <SectionLabel index="02">Product families supplied</SectionLabel>
                  <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {data.product_families.map((f) => (
                      <li key={f} className="flex items-baseline gap-3 border-b border-border/60 pb-3 text-sm">
                        <span className="font-mono text-[10px] text-primary tabular">—</span>
                        {categoryLabel(f)}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {data.gallery_urls.length > 0 && (
                <>
                  <div className="mt-14" />
                  <SectionLabel index="03">Gallery</SectionLabel>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {data.gallery_urls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt={data.title}
                        loading="lazy"
                        className="aspect-[4/3] w-full rounded-lg border object-cover"
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
              <Fact label="Client" value={displayClient(data)} />
              <Fact label="Location" value={[data.location, data.country].filter(Boolean).join(", ")} />
              <Fact label="Type" value={projectTypeLabel(data.project_type)} />
              {data.year && <Fact label="Year" value={String(data.year)} />}
              <Fact label="Status" value={data.status === "completed" ? "Completed" : "Ongoing"} />
              <div className="pt-4">
                <Button asChild className="w-full">
                  <Link to="/start">Start a project like this</Link>
                </Button>
              </div>
            </aside>
          </div>
        </article>
      )}
    </SiteShell>
  );
}
