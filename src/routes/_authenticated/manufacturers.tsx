import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  PACKAGE_CATEGORIES,
  QUALITY_TIERS,
  categoryLabel,
  tierLabel,
} from "@/config/packages";
import {
  MANUFACTURERS_PER_PACKAGE_MAX,
  MANUFACTURERS_PER_PACKAGE_MIN,
} from "@/config/policy";
import { listSupplierCoverage } from "@/services/packageService";

export const Route = createFileRoute("/_authenticated/manufacturers")({
  head: () => ({
    meta: [
      { title: "Manufacturers & coverage — UZA Build" },
      {
        name: "description",
        content:
          "Which factory covers which finishing product family, at which quality level, with its lead time.",
      },
      { property: "og:title", content: "Manufacturers & coverage — UZA Build" },
      {
        property: "og:description",
        content: "Factory coverage by product family and quality level, used to shortlist per package.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManufacturersPage,
});

const GROUPS = Array.from(new Set(PACKAGE_CATEGORIES.map((c) => c.group)));

function ManufacturersPage() {
  const queryClient = useQueryClient();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [coverageFor, setCoverageFor] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    country: "China",
    contact_name: "",
    email: "",
    phone: "",
    lead_time_days: "",
    notes: "",
  });
  const [coverageForm, setCoverageForm] = useState({
    category: "tiles",
    quality_tier: "value",
    lead_time_days: "",
    is_preferred: false,
    note: "",
  });

  const suppliers = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, country, contact_name, email, phone, lead_time_days, notes, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const coverage = useQuery({ queryKey: ["supplier-coverage"], queryFn: listSupplierCoverage });

  const addSupplier = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        name: supplierForm.name.trim(),
        country: supplierForm.country.trim() || "Rwanda",
        contact_name: supplierForm.contact_name || null,
        email: supplierForm.email || null,
        phone: supplierForm.phone || null,
        lead_time_days: supplierForm.lead_time_days ? Number(supplierForm.lead_time_days) : null,
        notes: supplierForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manufacturer added.");
      setSupplierOpen(false);
      setSupplierForm({ name: "", country: "China", contact_name: "", email: "", phone: "", lead_time_days: "", notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["suppliers-all"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCoverage = useMutation({
    mutationFn: async (supplierId: string) => {
      const { error } = await supabase.from("supplier_categories").insert({
        supplier_id: supplierId,
        category: coverageForm.category,
        quality_tier: coverageForm.quality_tier,
        is_preferred: coverageForm.is_preferred,
        lead_time_days: coverageForm.lead_time_days ? Number(coverageForm.lead_time_days) : null,
        note: coverageForm.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coverage recorded.");
      setCoverageFor(null);
      void queryClient.invalidateQueries({ queryKey: ["supplier-coverage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCoverage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplier_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["supplier-coverage"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const byCategory = PACKAGE_CATEGORIES.map((c) => ({
    category: c,
    rows: (coverage.data ?? []).filter((r) => r.category === c.key),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Manufacturers</h1>
          <p className="mt-1 text-muted-foreground">
            Who we can actually buy each finishing product from, at which quality level.
          </p>
        </div>
        <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" aria-hidden /> Add manufacturer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a manufacturer</DialogTitle>
              <DialogDescription>
                Record the factory once here, then add the product families it covers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-name">Name</Label>
                <Input id="m-name" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-country">Country</Label>
                  <Input id="m-country" value={supplierForm.country} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-lead">Typical lead time (days)</Label>
                  <Input
                    id="m-lead"
                    inputMode="numeric"
                    className="tabular"
                    value={supplierForm.lead_time_days}
                    onChange={(e) => setSupplierForm({ ...supplierForm, lead_time_days: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-contact">Contact person</Label>
                  <Input id="m-contact" value={supplierForm.contact_name} onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-email">Email</Label>
                  <Input id="m-email" type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-phone">Phone</Label>
                  <Input id="m-phone" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-notes">Notes</Label>
                <Textarea id="m-notes" value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} />
              </div>
              <Button
                className="w-full"
                disabled={!supplierForm.name.trim() || addSupplier.isPending}
                onClick={() => addSupplier.mutate()}
              >
                {addSupplier.isPending ? "Saving…" : "Add manufacturer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage by product family</CardTitle>
          <CardDescription>
            We aim for {MANUFACTURERS_PER_PACKAGE_MIN}–{MANUFACTURERS_PER_PACKAGE_MAX} factories per
            family per quality level, so every quotation can be compared like for like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={coverage.isLoading}
            error={coverage.error}
            isEmpty={byCategory.length === 0}
            onRetry={() => void coverage.refetch()}
            empty={
              <EmptyState
                title="No coverage recorded yet"
                description="Add a manufacturer, then record the product families it covers and at which quality level. Package shortlists are built from this list."
              />
            }
          >
            <div className="space-y-4">
              {byCategory.map(({ category, rows }) => (
                <div key={category.key} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{category.label}</p>
                    <Badge variant={rows.length >= MANUFACTURERS_PER_PACKAGE_MIN ? "secondary" : "destructive"}>
                      <span className="tabular">{rows.length}</span>&nbsp;registered
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{category.sourcingNote}</p>
                  <ul className="mt-3 space-y-2">
                    {rows.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Factory className="size-4 text-muted-foreground" aria-hidden />
                          <span className="font-medium">{r.suppliers?.name}</span>
                          <Badge variant="outline">{tierLabel(r.quality_tier)}</Badge>
                          {r.is_preferred && (
                            <Badge className="gap-1">
                              <Star className="size-3" aria-hidden /> Preferred
                            </Badge>
                          )}
                        </span>
                        <span className="flex items-center gap-3 text-muted-foreground">
                          <span>{r.suppliers?.country}</span>
                          {r.lead_time_days != null && <span className="tabular">{r.lead_time_days} days</span>}
                          <Button variant="ghost" size="sm" onClick={() => removeCoverage.mutate(r.id)}>
                            <Trash2 className="size-4" aria-hidden />
                            <span className="sr-only">Remove coverage</span>
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All manufacturers</CardTitle>
          <CardDescription>Add the families each factory covers so it can be shortlisted on a package.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={suppliers.isLoading}
            error={suppliers.error}
            isEmpty={(suppliers.data?.length ?? 0) === 0}
            onRetry={() => void suppliers.refetch()}
            empty={
              <EmptyState
                title="No manufacturers yet"
                description="Every factory UZA works with is recorded here with its contact, country and lead time."
              />
            }
          >
            <ul className="space-y-2">
              {(suppliers.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[s.country, s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Dialog
                    open={coverageFor === s.id}
                    onOpenChange={(o) => setCoverageFor(o ? s.id : null)}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="size-4" aria-hidden /> Add coverage
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Coverage for {s.name}</DialogTitle>
                        <DialogDescription>
                          One row per product family and quality level this factory can actually deliver.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Product family</Label>
                          <Select
                            value={coverageForm.category}
                            onValueChange={(v) => setCoverageForm({ ...coverageForm, category: v })}
                          >
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
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Quality level</Label>
                            <Select
                              value={coverageForm.quality_tier}
                              onValueChange={(v) => setCoverageForm({ ...coverageForm, quality_tier: v })}
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
                            <Label htmlFor="c-lead">Lead time (days)</Label>
                            <Input
                              id="c-lead"
                              inputMode="numeric"
                              className="tabular"
                              value={coverageForm.lead_time_days}
                              onChange={(e) =>
                                setCoverageForm({ ...coverageForm, lead_time_days: e.target.value.replace(/\D/g, "") })
                              }
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="c-pref"
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={coverageForm.is_preferred}
                            onChange={(e) => setCoverageForm({ ...coverageForm, is_preferred: e.target.checked })}
                          />
                          <Label htmlFor="c-pref">Preferred factory for this family</Label>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="c-note">Note</Label>
                          <Textarea
                            id="c-note"
                            placeholder="What they are actually good at, minimum order, certifications held."
                            value={coverageForm.note}
                            onChange={(e) => setCoverageForm({ ...coverageForm, note: e.target.value })}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Adding coverage for {categoryLabel(coverageForm.category)} at{" "}
                          {tierLabel(coverageForm.quality_tier).toLowerCase()}.
                        </p>
                        <Button className="w-full" disabled={addCoverage.isPending} onClick={() => addCoverage.mutate(s.id)}>
                          {addCoverage.isPending ? "Saving…" : "Record coverage"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
