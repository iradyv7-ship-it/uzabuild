import { createFileRoute, Link } from "@tanstack/react-router";
import { HardHat, Ruler, Layers, Sun, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  { icon: Ruler, title: "Honest takeoff", body: "Every quantity shows its method — area x coverage, count or linear run — with wastage the QS controls." },
  { icon: Layers, title: "Real BOQ hierarchy", body: "Project → house → floor → room → line item. Totals roll up at every level, live." },
  { icon: Sun, title: "Solar, seven ways", body: "20/80 through 80/20 solar-to-grid coverage, sized and priced from the same catalog." },
  { icon: Brain, title: "It learns", body: "Every human correction to an AI draft is captured as a training signal, tagged by role." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <HardHat className="size-6 text-accent" /> UZA Build
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Takeoff · Costing · Sign-off</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] md:text-6xl">
          Drawings in. A Bill of Quantities a QS actually trusts, out.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          The AI does the first draft — reads the drawing, counts the quantities, pulls the materials, prices them from one
          catalog. Your Architect, Quantity Surveyor, Interior Designer and MEP Engineer own the judgment and the sign-off.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Open the workspace</Link>
          </Button>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-5 text-accent" />
              <h2 className="mt-3 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
        Built for Rwanda first — structured to carry into Kenya, Uganda and beyond.
      </footer>
    </div>
  );
}
