import { createFileRoute, Link } from "@tanstack/react-router";
import { Ruler, Layers, Sun, Brain, FileText, Users, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell, SectionLabel } from "@/components/marketing/SiteChrome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UZA Build — Drawings to a priced Bill of Quantities" },
      {
        name: "description",
        content:
          "UZA Build turns drawings into a real, priced Bill of Quantities: AI drafts the takeoff, your Architect, QS, Designer and MEP Engineer approve it.",
      },
      { property: "og:title", content: "UZA Build — Drawings to a priced Bill of Quantities" },
      {
        property: "og:description",
        content: "AI-drafted takeoff and costing, signed off by the professionals who own the numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { index: "01", icon: Ruler, title: "Honest takeoff", body: "Every quantity shows its method — area x coverage, count or linear run — with wastage the QS controls." },
  { index: "02", icon: Layers, title: "Real BOQ hierarchy", body: "Project → house → floor → room → line item. Totals roll up at every level, live." },
  { index: "03", icon: Sun, title: "Solar, seven ways", body: "20/80 through 80/20 solar-to-grid coverage, sized and priced from the same catalog." },
  { index: "04", icon: Brain, title: "It learns", body: "Every human correction to an AI draft is captured as a training signal, tagged by role." },
];

const STEPS = [
  { icon: FileText, title: "Drawing goes in", body: "Upload the architectural drawing — floor plans, elevations, sections. Nothing is priced yet." },
  { icon: Brain, title: "AI drafts the takeoff", body: "Quantities, materials and a first price pull from one catalog, with the method shown for every line." },
  { icon: Users, title: "Your team signs off", body: "Architect, QS, Interior Designer and MEP Engineer each own their lines — nothing ships un-reviewed." },
];

/** A mock BOQ line item, used only to give the hero something concrete to show. */
const SAMPLE_LINE = {
  room: "Living room floor",
  method: "42.5 m² x coverage, 8% wastage",
  qty: "45.9 m²",
  unit: "Porcelain tile, 60x60",
  total: "1,240,650 RWF",
};

function Landing() {
  return (
    <SiteShell>
      {/* HERO — a faint blueprint grid behind the text, and a real sample BOQ line
          instead of an abstract icon, since the product's whole pitch is "trustworthy
          numbers," not a generic SaaS promise. */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-28 lg:pt-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
              Takeoff · Costing · Sign-off
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] md:text-6xl">
              Drawings in. A Bill of Quantities a QS actually trusts, out.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              The AI does the first draft — reads the drawing, counts the quantities, pulls the materials, prices them
              from one catalog. Your Architect, Quantity Surveyor, Interior Designer and MEP Engineer own the judgment
              and the sign-off.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Open the workspace</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          {/* Sample BOQ line card — the product's own artifact, not stock imagery. */}
          <div className="relative rounded-2xl border bg-card p-6 shadow-lg">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Sample line item
            </p>
            <div className="mt-4 flex items-baseline justify-between gap-4 border-b border-border pb-4">
              <span className="font-display text-lg font-semibold">{SAMPLE_LINE.room}</span>
              <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
                Signed off
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Method</dt>
              <dd className="text-right tabular">{SAMPLE_LINE.method}</dd>
              <dt className="text-muted-foreground">Quantity</dt>
              <dd className="text-right font-medium tabular">{SAMPLE_LINE.qty}</dd>
              <dt className="text-muted-foreground">Material</dt>
              <dd className="text-right">{SAMPLE_LINE.unit}</dd>
            </dl>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Line total
              </span>
              <span className="font-display text-xl font-semibold tabular">{SAMPLE_LINE.total}</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" />
              Approved by QS · method visible on every line
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <SectionLabel index="01">What it does</SectionLabel>
        <div className="mt-8 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ index, icon: Icon, title, body }) => (
            <div key={title} className="bg-card p-6">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-primary" />
                <span className="font-mono text-xs tabular text-muted-foreground">{index}</span>
              </div>
              <h2 className="mt-4 font-display text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-y bg-card">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <SectionLabel index="02">How it works</SectionLabel>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="relative pl-14">
                <div className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute -right-5 top-5 hidden h-px w-10 bg-border md:block" />
                )}
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Step {i + 1}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COVERAGE */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <SectionLabel index="03">Coverage</SectionLabel>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Built for Rwanda first — structured to carry into Kenya, Uganda and beyond.
        </p>
      </section>
    </SiteShell>
  );
}
