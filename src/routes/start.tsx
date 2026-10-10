/**
 * Public project enquiry — the qualifying front door.
 *
 * It ends by stating the BOQ preparation fee honestly: the amount comes from
 * src/config/policy.ts, it is tagged as proposed rather than published, and no
 * payment is taken here. Charging is a separate, deliberate step.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { SiteShell, SectionLabel } from "@/components/marketing/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUALITY_TIERS } from "@/config/packages";
import { BOQ_FEE_CREDITED_ON_ORDER, BOQ_PREPARATION_FEE_USD } from "@/config/policy";
import { BUDGET_BANDS, PROJECT_TYPES, submitEnquiry, type EnquiryInput } from "@/services/portfolioService";

export const Route = createFileRoute("/start")({
  head: () => ({
    meta: [
      { title: "Start a project — UZA Build finishing solutions" },
      {
        name: "description",
        content:
          "Tell us about the project: type, scale, target date, quality tier and budget band. We reply with the information we need and a priced Bill of Quantities.",
      },
      { property: "og:title", content: "Start a project — UZA Build" },
      { property: "og:description", content: "Brief UZA Build on your finishing project and receive a priced BOQ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StartProject,
});

const WHAT_WE_NEED = [
  "The latest technical drawings for the package",
  "A BOQ with item references, dimensions and quantities — or we produce it",
  "Technical specifications and required performance standards",
  "Design direction: style, colour, shape, pattern, texture, finish",
  "Renderings, reference pictures or approved samples",
  "Product-specific selections where they are already fixed",
  "The expected quality level",
  "A target budget range, where you have one",
  "The required delivery date",
  "Priority between packages and between projects",
];

const EMPTY: EnquiryInput = {
  contact_name: "",
  company: "",
  email: "",
  phone: "",
  project_type: "other",
  location: "",
  scale: "",
  target_date: "",
  quality_tier: "",
  budget_band: "",
  brief: "",
};

function StartProject() {
  const [form, setForm] = useState<EnquiryInput>(EMPTY);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => submitEnquiry(form),
    onSuccess: () => setDone(true),
    onError: (e: Error) => toast.error(e.message),
  });

  function set<K extends keyof EnquiryInput>(key: K, value: EnquiryInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <SiteShell>
      <section className="mx-auto max-w-7xl px-6 pb-12 pt-16">
        <SectionLabel index="00">Start a project</SectionLabel>
        <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] md:text-6xl">
          Brief us once. We take it from drawings to delivered space.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          This is the same intake our team uses internally. The more of it you can answer now, the faster the first priced
          Bill of Quantities comes back.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 lg:grid-cols-[1fr_22rem]">
        <div>
          {done ? (
            <div className="rounded-lg border border-primary/40 bg-card p-10">
              <CheckCircle2 className="size-6 text-primary" />
              <h2 className="mt-4 font-display text-xl font-semibold">Enquiry received</h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Our team will come back to you with the exact document list for your packages. Nothing has been charged and
                no commitment has been made by either side at this point.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link to="/portfolio">See delivered projects</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-10"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <fieldset className="space-y-5">
                <SectionLabel index="01">Who you are</SectionLabel>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name">Full name</Label>
                    <Input
                      id="contact_name"
                      required
                      value={form.contact_name}
                      onChange={(e) => set("contact_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company or developer</Label>
                    <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="+2507XXXXXXXX"
                      className="tabular"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-5">
                <SectionLabel index="02">The project</SectionLabel>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="project_type">Project type</Label>
                    <Select value={form.project_type} onValueChange={(v) => set("project_type", v)}>
                      <SelectTrigger id="project_type">
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
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="City, country"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scale">Scale</Label>
                    <Input
                      id="scale"
                      placeholder="e.g. 240 keys, 1,200 m², 36 apartments"
                      className="tabular"
                      value={form.scale}
                      onChange={(e) => set("scale", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target_date">Required delivery date</Label>
                    <Input
                      id="target_date"
                      type="date"
                      className="tabular"
                      value={form.target_date ?? ""}
                      onChange={(e) => set("target_date", e.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-5">
                <SectionLabel index="03">Standard and budget</SectionLabel>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quality_tier">Quality level</Label>
                    <Select {...(form.quality_tier ? { value: form.quality_tier } : {})} onValueChange={(v) => set("quality_tier", v)}>
                      <SelectTrigger id="quality_tier">
                        <SelectValue placeholder="Select a tier" />
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
                  <div className="space-y-2">
                    <Label htmlFor="budget_band">Budget band</Label>
                    <Select {...(form.budget_band ? { value: form.budget_band } : {})} onValueChange={(v) => set("budget_band", v)}>
                      <SelectTrigger id="budget_band" className="tabular">
                        <SelectValue placeholder="Select a band" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUDGET_BANDS.map((b) => (
                          <SelectItem key={b} value={b} className="tabular">
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brief">
                    Design direction and packages needed
                  </Label>
                  <Textarea
                    id="brief"
                    rows={6}
                    placeholder="Which packages (tiles, aluminium, lighting, cabinetry...), the style direction, and anything already selected."
                    value={form.brief}
                    onChange={(e) => set("brief", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Drawings, renderings and reference images are uploaded once the project is opened — we will send you the
                    link.
                  </p>
                </div>
              </fieldset>

              <Button type="submit" size="lg" disabled={mutation.isPending}>
                {mutation.isPending ? "Sending…" : "Send enquiry"}
              </Button>
            </form>
          )}
        </div>

        <aside className="space-y-10 lg:sticky lg:top-28 lg:self-start">
          <div>
            <SectionLabel>What we will ask for</SectionLabel>
            <ul className="mt-5 space-y-3">
              {WHAT_WE_NEED.map((item, i) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-mono text-[11px] tabular text-primary">{String(i + 1).padStart(2, "0")}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Commitment fee — proposed
              </p>
            </div>
            <p className="mt-4 font-display text-3xl font-semibold tabular">USD {BOQ_PREPARATION_FEE_USD}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A BOQ preparation fee covers the takeoff, the priced Bill of Quantities and the factory activation needed to
              start processing an order.
              {BOQ_FEE_CREDITED_ON_ORDER && " It is credited in full against your order when you place it."}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              This amount is proposed internally and not yet published as a fixed tariff. Nothing is charged through this
              form; we confirm the fee with you in writing before any payment.
            </p>
          </div>
        </aside>
      </section>
    </SiteShell>
  );
}
