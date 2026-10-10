/**
 * Public capabilities page: what UZA Build sources, and at which standard.
 * Content is generated from the real sourcing configuration, not marketing copy.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell, SectionLabel } from "@/components/marketing/SiteChrome";
import { Button } from "@/components/ui/button";
import { MINIMUM_STANDARD, PACKAGE_CATEGORIES, QUALITY_TIERS } from "@/config/packages";

export const Route = createFileRoute("/capabilities")({
  head: () => ({
    meta: [
      { title: "Capabilities — what UZA Build sources and to what standard" },
      {
        name: "description",
        content:
          "Aluminium, doors, tiles, carpets, acoustic panels, lighting, cabinetry, sanitaryware and hotel supply — sourced through UZA's China corridor at three published quality tiers.",
      },
      { property: "og:title", content: "Capabilities — UZA Build finishing solutions" },
      {
        property: "og:description",
        content: "Finishing product families UZA sources, the three quality tiers, and the standard we never go below.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Capabilities,
});

function Capabilities() {
  const groups = Array.from(new Set(PACKAGE_CATEGORIES.map((c) => c.group)));

  return (
    <SiteShell>
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-16">
        <SectionLabel index="00">Capabilities</SectionLabel>
        <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] md:text-6xl">
          One supplier for every finishing package on the project.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Each product family is sourced from a shortlist of two to three vetted factories, quoted against your drawings
          and specification, inspected by our QC team in China, and delivered to site as one coordinated programme.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <SectionLabel index="01">Product families</SectionLabel>
        <div className="mt-8 space-y-12">
          {groups.map((group) => (
            <div key={group}>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">{group}</h2>
              <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
                {PACKAGE_CATEGORIES.filter((c) => c.group === group).map((c) => (
                  <div key={c.key} className="border-t border-border pt-4">
                    <h3 className="text-base font-semibold">{c.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.sourcingNote}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <SectionLabel index="02">Quality tiers</SectionLabel>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {QUALITY_TIERS.map((t, i) => (
              <div key={t.value} className="border-t-2 border-primary pt-5">
                <p className="font-mono text-[11px] tabular text-primary">0{i + 1}</p>
                <h3 className="mt-2 font-display text-lg font-semibold">{t.label}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-16">
            <SectionLabel index="03">The standard we never go below</SectionLabel>
            <ul className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">
              {MINIMUM_STANDARD.map((s, i) => (
                <li key={s} className="flex gap-4 border-b border-border/60 pb-4 text-sm leading-relaxed">
                  <span className="font-mono text-[11px] tabular text-primary">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="max-w-xl font-display text-2xl font-semibold leading-tight md:text-3xl">
              Send us the drawings. We will come back with a priced Bill of Quantities.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              No catalogue browsing, no SKU lists. A scoped brief, a shortlist of factories, and one accountable supplier.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/start">Start a project</Link>
          </Button>
        </div>
      </section>
    </SiteShell>
  );
}
