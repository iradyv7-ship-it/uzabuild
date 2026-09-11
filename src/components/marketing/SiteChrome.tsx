/**
 * Public-site chrome. Deliberately quiet: a rule, a wordmark, four links.
 * Nothing here shows cost, catalog or supplier information.
 */
import { Link } from "@tanstack/react-router";
import { HardHat } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { UZA_ISSUER } from "@/config/company";

const LINKS = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/capabilities", label: "Capabilities" },
  { to: "/start", label: "Start a project" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <HardHat className="size-5 text-primary" />
          <span className="font-display text-base font-semibold tracking-tight">UZA Build</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:inline">
            Finishing Solutions
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {/* These marketing pages (portfolio, capabilities, start) are not built
              yet in this app — plain anchors until real routes exist for them. */}
          {LINKS.map((l) => (
            <a
              key={l.to}
              href={l.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href="/start">Start a project</a>
          </Button>
        </div>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-border/60 px-6 py-2 md:hidden">
        {LINKS.map((l) => (
          <a key={l.to} href={l.to} className="whitespace-nowrap text-sm text-muted-foreground">
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <HardHat className="size-4 text-primary" />
            <span className="font-display text-sm font-semibold">UZA Build</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Finishing solutions for mega projects, apartments, hotels, developers and individual homeowners.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Offices</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {UZA_ISSUER.addressLines.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
            Rwanda · DRC · Uganda · China
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Contact</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground tabular">
            {UZA_ISSUER.email}
            <br />
            {UZA_ISSUER.phone}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Platform</p>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <a href="/portfolio" className="hover:text-foreground">
              Portfolio
            </a>
            <a href="/capabilities" className="hover:text-foreground">
              Capabilities
            </a>
            <a href="/start" className="hover:text-foreground">
              Start a project
            </a>
            <Link to="/auth" className="hover:text-foreground">
              Client & team sign-in
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl border-t border-border/60 px-6 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          UZA Solutions Ltd — Rwanda first, East Africa next
        </p>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Small caps rule used to open every section. */
export function SectionLabel({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-border pt-4">
      {index && <span className="font-mono text-[10px] tabular text-primary">{index}</span>}
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{children}</span>
    </div>
  );
}
