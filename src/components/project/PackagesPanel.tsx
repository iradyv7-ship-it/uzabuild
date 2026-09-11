import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryState, EmptyState } from "@/components/DataState";
import { useAuth } from "@/context/AuthContext";
import { PackageDetail } from "@/components/project/PackageDetail";
import {
  MINIMUM_STANDARD,
  PACKAGE_CATEGORIES,
  QUALITY_TIERS,
  categoryLabel,
  packageStatusLabel,
  tierLabel,
} from "@/config/packages";
import { BOQ_PREPARATION_FEE_USD, MANUFACTURER_ACTIVATION_FEE_USD } from "@/config/policy";
import {
  createPackage,
  listAttachments,
  listPackageManufacturers,
  listPackages,
  listRequirements,
  listSupplierCoverage,
  readiness,
} from "@/services/packageService";

const GROUPS = Array.from(new Set(PACKAGE_CATEGORIES.map((c) => c.group)));

/**
 * Product packages — the sourcing side of a project.
 *
 * One package is one product family going to one set of factories. The
 * checklist on each package is the brief a factory actually needs; until every
 * blocking item is provided the package is honestly marked as not ready.
 */
export function PackagesPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "tiles",
    title: "",
    quality_tier: "value",
    phase: "1",
    priority: "3",
    required_delivery_date: "",
    scope_note: "",
  });

  const packages = useQuery({ queryKey: ["packages", projectId], queryFn: () => listPackages(projectId) });
  const requirements = useQuery({
    queryKey: ["package-requirements", projectId],
    queryFn: () => listRequirements(projectId),
  });
  const attachments = useQuery({
    queryKey: ["package-attachments", projectId],
    queryFn: () => listAttachments(projectId),
  });
  const manufacturers = useQuery({
    queryKey: ["package-manufacturers", projectId],
    queryFn: () => listPackageManufacturers(projectId),
  });
  const coverage = useQuery({ queryKey: ["supplier-coverage"], queryFn: listSupplierCoverage });

  const create = useMutation({
    mutationFn: () =>
      createPackage({
        projectId,
        category: form.category,
        title: form.title.trim() || categoryLabel(form.category),
        qualityTier: form.quality_tier,
        phase: Number(form.phase),
        priority: Number(form.priority),
        scopeNote: form.scope_note,
        requiredDeliveryDate: form.required_delivery_date || null,
        userId: user?.id ?? null,
      }),
    onSuccess: (id) => {
      toast.success("Package created with its full sourcing checklist.");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", scope_note: "", required_delivery_date: "" }));
      setExpanded(id);
      void queryClient.invalidateQueries({ queryKey: ["packages", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["package-requirements", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * The exact list of what is still missing, in plain sentences, ready to be
   * pasted into a message to the client or the architect. It is generated from
   * the record, so it can never disagree with the platform.
   */
  function copyRequestList() {
    const pkgs = packages.data ?? [];
    const reqs = requirements.data ?? [];
    const blocks = pkgs
      .map((p) => {
        const state = readiness(reqs.filter((r) => r.package_id === p.id));
        if (state.ready) return null;
        return `${p.package_code ?? ""} ${p.title} (phase ${p.phase}, priority ${p.priority}) — still needed:\n` +
          state.blockers.map((b) => `  - ${b}`).join("\n");
      })
      .filter(Boolean);
    if (blocks.length === 0) {
      toast.info("Nothing outstanding — every package has its blocking items on the record.");
      return;
    }
    const text = `To move these packages to the factories we still need:\n\n${blocks.join("\n\n")}`;
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Request list copied — paste it to the client or the architect."))
      .catch(() => toast.error("Could not copy. Select the list on the packages below instead."));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4 text-muted-foreground" aria-hidden /> Sourcing packages
            </CardTitle>
            <CardDescription>
              Each product family is briefed, priced and ordered as its own package. A package is only
              sent to factories once every blocking item of its brief is on the record.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyRequestList}>
            <Copy className="size-4" aria-hidden /> Copy the request list
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" aria-hidden /> New package
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New sourcing package</DialogTitle>
                <DialogDescription>
                  The ten-point sourcing checklist is created with the package, so nothing is
                  remembered from a conversation.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Product family</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUPS.map((g) => (
                        <SelectGroup key={g}>
                          <SelectLabel>{g}</SelectLabel>
                          {PACKAGE_CATEGORIES.filter((c) => c.group === g).map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-title">Package name</Label>
                  <Input
                    id="pkg-title"
                    placeholder={categoryLabel(form.category)}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Quality level</Label>
                    <Select
                      value={form.quality_tier}
                      onValueChange={(v) => setForm((f) => ({ ...f, quality_tier: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUALITY_TIERS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {QUALITY_TIERS.find((t) => t.value === form.quality_tier)?.description}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phase</Label>
                    <Select value={form.phase} onValueChange={(v) => setForm((f) => ({ ...f, phase: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((p) => (
                          <SelectItem key={p} value={String(p)}>
                            Phase {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority (1 = first)</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((p) => (
                          <SelectItem key={p} value={String(p)}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-date">Required on site</Label>
                  <Input
                    id="pkg-date"
                    type="date"
                    value={form.required_delivery_date}
                    onChange={(e) => setForm((f) => ({ ...f, required_delivery_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-scope">Scope note</Label>
                  <Textarea
                    id="pkg-scope"
                    placeholder="What is in this package, and what is explicitly excluded."
                    value={form.scope_note}
                    onChange={(e) => setForm((f) => ({ ...f, scope_note: e.target.value }))}
                  />
                </div>
                <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? "Creating…" : "Create package"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> The standard we never
              go below
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {MINIMUM_STANDARD.map((s) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">BOQ preparation fee</p>
            <p className="mt-2 text-sm text-muted-foreground">
              A minimum of{" "}
              <span className="tabular font-medium text-foreground">
                USD {BOQ_PREPARATION_FEE_USD.toLocaleString("en-GB")}
              </span>{" "}
              per package is charged for BOQ preparation and factory engagement, of which{" "}
              <span className="tabular font-medium text-foreground">
                USD {MANUFACTURER_ACTIVATION_FEE_USD.toLocaleString("en-GB")}
              </span>{" "}
              activates the manufacturer. It is credited in full against the order when the client
              places it.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Proposed policy, not yet published to clients — it is not billed automatically anywhere
              in the platform.
            </p>
          </div>
        </CardContent>
      </Card>

      <QueryState
        isLoading={packages.isLoading || requirements.isLoading}
        error={packages.error ?? requirements.error}
        isEmpty={(packages.data?.length ?? 0) === 0}
        onRetry={() => void packages.refetch()}
        empty={
          <EmptyState
            title="No packages yet"
            description="Create one package per product family — aluminium windows, tiles, lighting — and each will carry its own brief, files, factories and delivery date."
          />
        }
      >
        <div className="space-y-4">
          {(packages.data ?? []).map((pkg) => {
            const rows = (requirements.data ?? []).filter((r) => r.package_id === pkg.id);
            const state = readiness(rows);
            const isOpen = expanded === pkg.id;
            return (
              <Card key={pkg.id}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[16rem]">
                    <p className="tabular text-xs font-medium tracking-wide text-muted-foreground">
                      {pkg.package_code ?? "—"}
                    </p>
                    <CardTitle className="mt-1 text-base">{pkg.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Phase <span className="tabular">{pkg.phase}</span> · {categoryLabel(pkg.category)} ·{" "}
                      {tierLabel(pkg.quality_tier)} · priority{" "}
                      <span className="tabular">{pkg.priority}</span>
                      {pkg.required_delivery_date
                        ? ` · on site ${new Date(pkg.required_delivery_date).toLocaleDateString("en-GB")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{packageStatusLabel(pkg.status)}</Badge>
                    {state.ready ? (
                      <Badge className="gap-1">
                        <CheckCircle2 className="size-3" aria-hidden /> Ready to source
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="tabular">
                        {state.blockers.length} blocking
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setExpanded(isOpen ? null : pkg.id)}>
                      {isOpen ? (
                        <>
                          Close <ChevronUp className="size-4" aria-hidden />
                        </>
                      ) : (
                        <>
                          Open brief <ChevronDown className="size-4" aria-hidden />
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Brief completeness</span>
                      <span className="tabular font-medium">
                        {state.provided} / {state.total}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={state.total}
                      aria-valuenow={state.provided}
                      aria-label={`${pkg.title} brief completeness`}
                    >
                      <div
                        className={state.ready ? "h-full bg-primary" : "h-full bg-muted-foreground"}
                        style={{ width: `${(state.provided / state.total) * 100}%` }}
                      />
                    </div>
                    {!state.ready && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Still needed before a factory can be approached: {state.blockers.join("; ")}.
                      </p>
                    )}
                  </div>

                  {isOpen && (
                    <PackageDetail
                      pkg={pkg}
                      projectId={projectId}
                      requirements={requirements.data ?? []}
                      attachments={attachments.data ?? []}
                      manufacturers={manufacturers.data ?? []}
                      coverage={coverage.data ?? []}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </QueryState>
    </div>
  );
}
