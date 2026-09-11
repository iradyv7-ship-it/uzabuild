import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Paperclip, Trash2, Factory, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/DataState";
import { useAuth } from "@/context/AuthContext";
import {
  ATTACHMENT_KINDS,
  MANUFACTURER_STATUSES,
  PACKAGE_REQUIREMENTS,
  PACKAGE_STATUSES,
  QUALITY_TIERS,
  REQUIREMENT_OWNERS,
  REQUIREMENT_STATUSES,
  categoryNote,
  tierLabel,
} from "@/config/packages";
import {
  MANUFACTURERS_PER_PACKAGE_MAX,
  MANUFACTURERS_PER_PACKAGE_MIN,
} from "@/config/policy";
import { formatMoney, toMajor, toMinor } from "@/lib/pricing";
import {
  type PackageAttachment,
  type PackageManufacturer,
  type PackageRequirementRow,
  type ProductPackage,
  type SupplierCoverage,
  deleteAttachment,
  removeManufacturer,
  setManufacturerCommitment,
  setManufacturerStatus,
  shortlistManufacturer,
  signedFileUrl,
  updatePackage,
  updateRequirement,
  uploadPackageFile,
} from "@/services/packageService";

/** Design-direction fields. Quality level alone is not a design direction. */
const DESIGN_FIELDS = [
  { key: "style_note", label: "Style", placeholder: "e.g. contemporary, warm minimal, institutional" },
  { key: "colour_note", label: "Colour", placeholder: "e.g. warm grey body, bronze frames" },
  { key: "shape_note", label: "Shape / form", placeholder: "e.g. rectangular 600x1200, square edge" },
  { key: "pattern_note", label: "Pattern", placeholder: "e.g. stone-look veining, plain, linear" },
  { key: "texture_note", label: "Texture", placeholder: "e.g. soft touch, structured, smooth" },
  { key: "finish_note", label: "Surface finish", placeholder: "e.g. matt R10, powder-coated satin" },
  {
    key: "performance_note",
    label: "Performance standards",
    placeholder: "e.g. NRC 0.75, EI30, slip R11, IP65",
  },
] as const;

export function PackageDetail({
  pkg,
  projectId,
  requirements,
  attachments,
  manufacturers,
  coverage,
}: {
  pkg: ProductPackage;
  projectId: string;
  requirements: PackageRequirementRow[];
  attachments: PackageAttachment[];
  manufacturers: PackageManufacturer[];
  coverage: SupplierCoverage[];
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ key: string | null; kind: string } | null>(null);
  const [design, setDesign] = useState<Record<string, string>>({});
  const currency = pkg.budget_currency as "RWF" | "USD" | "CNY";
  const [budget, setBudget] = useState<string>(
    pkg.target_budget_minor != null ? String(toMajor(pkg.target_budget_minor, currency)) : "",
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["packages", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["package-requirements", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["package-attachments", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["package-manufacturers", projectId] });
  };

  const savePackage = useMutation({
    mutationFn: (patch: Parameters<typeof updatePackage>[1]) => updatePackage(pkg.id, patch),
    onSuccess: () => {
      toast.success("Package updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRequirement = useMutation({
    mutationFn: (input: { id: string; patch: { status?: string; note?: string | null } }) =>
      updateRequirement(input.id, input.patch, user?.id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadPackageFile({
        projectId,
        packageId: pkg.id,
        requirementKey: uploadTarget?.key ?? null,
        kind: uploadTarget?.kind ?? "other",
        file,
        userId: user?.id ?? null,
      }),
    onSuccess: () => {
      toast.success("File attached to the package.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addManufacturer = useMutation({
    mutationFn: (supplierId: string) =>
      shortlistManufacturer({ projectId, packageId: pkg.id, supplierId, userId: user?.id ?? null }),
    onSuccess: () => {
      toast.success("Manufacturer shortlisted.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mine = manufacturers.filter((m) => m.package_id === pkg.id);
  const myAttachments = attachments.filter((a) => a.package_id === pkg.id);
  const eligible = coverage.filter(
    (c) =>
      c.category === pkg.category &&
      c.quality_tier === pkg.quality_tier &&
      c.suppliers?.is_active !== false &&
      !mine.some((m) => m.supplier_id === c.supplier_id),
  );

  function openUpload(key: string | null, kind: string) {
    setUploadTarget({ key, kind });
    fileInput.current?.click();
  }

  async function openFile(path: string) {
    try {
      const url = await signedFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />

      {/* commercial + status ------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commercial frame</CardTitle>
          <CardDescription>{categoryNote(pkg.category)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Quality level</Label>
            <Select
              value={pkg.quality_tier}
              onValueChange={(v) => savePackage.mutate({ quality_tier: v })}
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
          </div>
          <div className="space-y-1.5">
            <Label>Priority (1 = first)</Label>
            <Select
              value={String(pkg.priority)}
              onValueChange={(v) => savePackage.mutate({ priority: Number(v) })}
            >
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
          <div className="space-y-1.5">
            <Label htmlFor={`delivery-${pkg.id}`}>Required on site</Label>
            <Input
              id={`delivery-${pkg.id}`}
              type="date"
              defaultValue={pkg.required_delivery_date ?? ""}
              onBlur={(e) => savePackage.mutate({ required_delivery_date: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`budget-${pkg.id}`}>Target budget ({pkg.budget_currency})</Label>
            <Input
              id={`budget-${pkg.id}`}
              inputMode="numeric"
              className="tabular"
              placeholder="Range midpoint"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() =>
                savePackage.mutate({
                  target_budget_minor: budget === "" ? null : toMinor(Number(budget), currency),
                })
              }
            />
            {pkg.target_budget_minor != null && (
              <p className="tabular text-xs text-muted-foreground">
                {formatMoney(pkg.target_budget_minor, currency)}
              </p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Package status</Label>
            <Select value={pkg.status} onValueChange={(v) => savePackage.mutate({ status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`scope-${pkg.id}`}>Scope note</Label>
            <Textarea
              id={`scope-${pkg.id}`}
              defaultValue={pkg.scope_note ?? ""}
              placeholder="What is in this package, and what is explicitly excluded."
              onBlur={(e) => savePackage.mutate({ scope_note: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      {/* design direction --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Design direction</CardTitle>
          <CardDescription>
            {tierLabel(pkg.quality_tier)} on its own is not enough to source from. These fields, plus
            reference pictures, are what let a factory be given a real brief.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {DESIGN_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${f.key}-${pkg.id}`}>{f.label}</Label>
              <Textarea
                id={`${f.key}-${pkg.id}`}
                rows={2}
                placeholder={f.placeholder}
                defaultValue={pkg[f.key] ?? ""}
                onChange={(e) => setDesign((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => {
                  const value = design[f.key];
                  if (value === undefined || value === (pkg[f.key] ?? "")) return;
                  savePackage.mutate({ [f.key]: value || null });
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* the checklist ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sourcing brief checklist</CardTitle>
          <CardDescription>
            Items marked as blocking must be provided before this package goes to a factory. Where a
            document is needed, attach it here rather than sending it privately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PACKAGE_REQUIREMENTS.map((def) => {
            const row = requirements.find(
              (r) => r.package_id === pkg.id && r.requirement_key === def.key,
            );
            const files = myAttachments.filter((a) => a.requirement_key === def.key);
            const done = row?.status === "provided" || row?.status === "not_applicable";
            return (
              <div key={def.key} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[16rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{def.label}</p>
                      {def.blocksSourcing && !done && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" aria-hidden /> Blocking
                        </Badge>
                      )}
                      <Badge variant="outline">{REQUIREMENT_OWNERS[def.owner]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{def.why}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {def.needsDocument && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!row || upload.isPending}
                        onClick={() =>
                          openUpload(
                            def.key,
                            def.key === "final_drawings"
                              ? "drawing"
                              : def.key === "boq_reference"
                                ? "boq"
                                : "reference_image",
                          )
                        }
                      >
                        <FileUp className="size-4" aria-hidden /> Attach
                      </Button>
                    )}
                    <Select
                      value={row?.status ?? "missing"}
                      onValueChange={(v) => row && saveRequirement.mutate({ id: row.id, patch: { status: v } })}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REQUIREMENT_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  className="mt-3"
                  rows={2}
                  placeholder="What was provided, or what we are still waiting for."
                  defaultValue={row?.note ?? ""}
                  onBlur={(e) =>
                    row &&
                    e.target.value !== (row.note ?? "") &&
                    saveRequirement.mutate({ id: row.id, patch: { note: e.target.value || null } })
                  }
                />
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{f.file_name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => void openFile(f.storage_path)}>
                            <Download className="size-4" aria-hidden />
                            <span className="sr-only">Open {f.file_name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await deleteAttachment(f.id);
                              invalidate();
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                            <span className="sr-only">Remove {f.file_name}</span>
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* other attachments -------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Package file room</CardTitle>
            <CardDescription>
              Renderings, samples and anything else that belongs to this package.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={uploadTarget?.kind ?? "rendering"}
              onValueChange={(v) => setUploadTarget({ key: null, kind: v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTACHMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => openUpload(null, uploadTarget?.kind ?? "rendering")}
            >
              <FileUp className="size-4" aria-hidden /> Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {myAttachments.filter((a) => !a.requirement_key).length === 0 ? (
            <EmptyState
              title="No package files yet"
              description="Renderings, approved sample photos and supporting documents you upload here stay attached to this package."
            />
          ) : (
            <ul className="space-y-2">
              {myAttachments
                .filter((a) => !a.requirement_key)
                .map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary">
                        {ATTACHMENT_KINDS.find((k) => k.value === f.kind)?.label ?? f.kind}
                      </Badge>
                      <span className="truncate">{f.file_name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void openFile(f.storage_path)}>
                        <Download className="size-4" aria-hidden />
                        <span className="sr-only">Open {f.file_name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await deleteAttachment(f.id);
                          invalidate();
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Remove {f.file_name}</span>
                      </Button>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* manufacturers ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manufacturers for this package</CardTitle>
          <CardDescription>
            We keep {MANUFACTURERS_PER_PACKAGE_MIN}–{MANUFACTURERS_PER_PACKAGE_MAX} factories per
            product family at the same quality level, so a quotation can always be compared against a
            like-for-like one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mine.length === 0 ? (
            <EmptyState
              title="No factory shortlisted yet"
              description="Add the manufacturers that cover this product family at this quality level. Coverage is maintained in the catalog."
            />
          ) : (
            <ul className="space-y-2">
              {mine.map((m) => {
                const c = coverage.find((x) => x.supplier_id === m.supplier_id);
                return (
                  <li key={m.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          <Factory className="size-4 text-muted-foreground" aria-hidden />
                          {c?.suppliers?.name ?? "Manufacturer"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {[c?.suppliers?.country, c?.lead_time_days ? `${c.lead_time_days} days lead time` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={m.status} onValueChange={(v) => void setManufacturerStatus(m.id, v).then(invalidate)}>
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MANUFACTURER_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void removeManufacturer(m.id).then(invalidate)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Remove manufacturer</span>
                        </Button>
                      </div>
                    </div>
                    <CommitmentEditor row={m} onSaved={invalidate} />
                  </li>
                );
              })}
            </ul>
          )}

          {eligible.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1 space-y-1.5">
                <Label>Add a manufacturer that covers this family</Label>
                <Select onValueChange={(v) => addManufacturer.mutate(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((c) => (
                      <SelectItem key={c.id} value={c.supplier_id}>
                        {c.suppliers?.name} — {c.suppliers?.country}
                        {c.is_preferred ? " (preferred)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No further manufacturer is registered for {tierLabel(pkg.quality_tier).toLowerCase()} in
              this product family. Add coverage on the supplier record in the catalog first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


/**
 * What the factory has actually committed to: confirmed, deposit paid,
 * in production, shipping. Recorded here so nobody has to ask twice.
 */
function CommitmentEditor({
  row,
  onSaved,
}: {
  row: PackageManufacturer;
  onSaved: () => void;
}) {
  const toDate = (v: string | null) => (v ? v.slice(0, 10) : "");
  const [form, setForm] = useState({
    confirmed_at: toDate(row.confirmed_at),
    deposit_paid_at: toDate(row.deposit_paid_at),
    deposit_amount: row.deposit_amount_minor != null
      ? String(toMajor(row.deposit_amount_minor, (row.deposit_currency as "RWF" | "USD" | "CNY") ?? "USD"))
      : "",
    production_started_at: toDate(row.production_started_at),
    expected_ship_date: toDate(row.expected_ship_date),
  });

  const save = useMutation({
    mutationFn: () => {
      const currency = (row.deposit_currency as "RWF" | "USD" | "CNY") ?? "USD";
      return setManufacturerCommitment(row.id, {
        confirmed_at: form.confirmed_at ? new Date(form.confirmed_at).toISOString() : null,
        deposit_paid_at: form.deposit_paid_at ? new Date(form.deposit_paid_at).toISOString() : null,
        deposit_amount_minor: form.deposit_amount ? toMinor(Number(form.deposit_amount), currency) : null,
        production_started_at: form.production_started_at
          ? new Date(form.production_started_at).toISOString()
          : null,
        expected_ship_date: form.expected_ship_date || null,
      });
    },
    onSuccess: () => {
      toast.success("Factory commitment recorded.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currency = (row.deposit_currency as "RWF" | "USD" | "CNY") ?? "USD";

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={row.confirmed_at ? "default" : "outline"}>
          {row.confirmed_at ? "Confirmed" : "Not confirmed"}
        </Badge>
        <Badge variant={row.deposit_paid_at ? "default" : "outline"}>
          {row.deposit_paid_at
            ? `Deposit paid ${formatMoney(row.deposit_amount_minor ?? 0, currency)}`
            : "Deposit not paid"}
        </Badge>
        <Badge variant={row.production_started_at ? "default" : "outline"}>
          {row.production_started_at ? "In production" : "Not in production"}
        </Badge>
        {row.expected_ship_date && (
          <Badge variant="secondary" className="tabular">
            Ships {new Date(row.expected_ship_date).toLocaleDateString("en-GB")}
          </Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor={`cf-${row.id}`}>Confirmed on</Label>
          <Input
            id={`cf-${row.id}`}
            type="date"
            value={form.confirmed_at}
            onChange={(e) => setForm({ ...form, confirmed_at: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`dp-${row.id}`}>Deposit paid on</Label>
          <Input
            id={`dp-${row.id}`}
            type="date"
            value={form.deposit_paid_at}
            onChange={(e) => setForm({ ...form, deposit_paid_at: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`da-${row.id}`}>Deposit ({currency})</Label>
          <Input
            id={`da-${row.id}`}
            inputMode="decimal"
            className="tabular"
            value={form.deposit_amount}
            onChange={(e) => setForm({ ...form, deposit_amount: e.target.value.replace(/[^\d.]/g, "") })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pr-${row.id}`}>Production started</Label>
          <Input
            id={`pr-${row.id}`}
            type="date"
            value={form.production_started_at}
            onChange={(e) => setForm({ ...form, production_started_at: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sh-${row.id}`}>Expected shipping</Label>
          <Input
            id={`sh-${row.id}`}
            type="date"
            value={form.expected_ship_date}
            onChange={(e) => setForm({ ...form, expected_ship_date: e.target.value })}
          />
        </div>
      </div>
      <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save commitment"}
      </Button>
    </div>
  );
}
