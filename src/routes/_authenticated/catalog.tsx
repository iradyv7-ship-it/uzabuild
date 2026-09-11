import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CURRENCIES, money, type Currency } from "@/lib/boq";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({
    meta: [
      { title: "Materials Catalog — UZA Build" },
      { name: "description", content: "One source of truth for material prices, sources and price history." },
      { property: "og:title", content: "Materials Catalog — UZA Build" },
      { property: "og:description", content: "One source of truth for material prices, sources and price history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

const SOURCES = ["manual", "supplier", "manufacturer"] as const;

function CatalogPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [historyItem, setHistoryItem] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalog_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalog-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalog_items").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["price-history", historyItem],
    enabled: !!historyItem,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_price_history")
        .select("*")
        .eq("item_id", historyItem!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updatePrice = useMutation({
    mutationFn: async (vars: { id: string; price: number; source: string }) => {
      const { error } = await supabase
        .from("catalog_items")
        .update({
          price: vars.price,
          price_source: vars.source as (typeof SOURCES)[number],
          price_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Price updated — every open BOQ using it re-prices now.");
      void queryClient.invalidateQueries({ queryKey: ["catalog-items"] });
      void queryClient.invalidateQueries({ queryKey: ["price-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = items.filter(
    (i) =>
      (categoryId === "all" || i.category_id === categoryId) &&
      i.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Materials Catalog</h1>
          <p className="mt-1 text-muted-foreground">Every price carries its source and date. BOQ lines reference these items.</p>
        </div>
        <NewItemDialog categories={categories} userId={user?.id} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-40">Update price</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No items yet. Add the first one.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.name}</p>
                    {item.code && <p className="font-mono text-xs text-muted-foreground">{item.code}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {categories.find((c) => c.id === item.category_id)?.name}
                  </TableCell>
                  <TableCell className="text-sm">{item.unit}</TableCell>
                  <TableCell className="tabular text-right">{money(item.price, item.currency as Currency)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.price_source}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{item.price_date}</span>
                  </TableCell>
                  <TableCell>
                    <PriceEditor
                      current={Number(item.price)}
                      onSave={(price, source) => updatePrice.mutate({ id: item.id, price, source })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setHistoryItem(item.id)}>
                      <History className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!historyItem} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Price history</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-muted-foreground">No recorded changes.</p>}
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span className="tabular">{money(h.price, h.currency as Currency)}</span>
                <span className="text-muted-foreground">
                  {h.price_source} · {h.price_date}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PriceEditor({ current, onSave }: { current: number; onSave: (price: number, source: string) => void }) {
  const [value, setValue] = useState(String(current));
  const [source, setSource] = useState<string>("manual");
  return (
    <div className="flex gap-1">
      <Input className="h-8 w-24" value={value} onChange={(e) => setValue(e.target.value)} />
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger className="h-8 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOURCES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="secondary" className="h-8" onClick={() => onSave(Number(value), source)}>
        Save
      </Button>
    </div>
  );
}

function NewItemDialog({
  categories,
  userId,
}: {
  categories: { id: string; name: string }[];
  userId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    category_id: "",
    unit: "m2",
    price: "0",
    currency: "RWF" as Currency,
    price_source: "manual",
    coverage_per_unit: "",
    default_wastage_pct: "10",
    supplier: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("catalog_items").insert({
        name: form.name,
        code: form.code || null,
        category_id: form.category_id,
        unit: form.unit,
        price: Number(form.price),
        currency: form.currency,
        price_source: form.price_source as (typeof SOURCES)[number],
        coverage_per_unit: form.coverage_per_unit ? Number(form.coverage_per_unit) : null,
        default_wastage_pct: Number(form.default_wastage_pct || 0),
        supplier: form.supplier || null,
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item added to the catalog.");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["catalog-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New catalog item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ci-name">Name</Label>
            <Input id="ci-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-code">Code</Label>
            <Input id="ci-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-category">Category</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger id="ci-category">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-unit">Unit</Label>
            <Input id="ci-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-coverage">Coverage per unit (optional)</Label>
            <Input id="ci-coverage" value={form.coverage_per_unit} onChange={(e) => setForm({ ...form, coverage_per_unit: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-price">Price</Label>
            <Input id="ci-price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-currency">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
              <SelectTrigger id="ci-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-source">Price source</Label>
            <Select value={form.price_source} onValueChange={(v) => setForm({ ...form, price_source: v })}>
              <SelectTrigger id="ci-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ci-wastage">Default wastage %</Label>
            <Input id="ci-wastage" value={form.default_wastage_pct} onChange={(e) => setForm({ ...form, default_wastage_pct: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ci-supplier">Supplier</Label>
            <Input id="ci-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
        </div>

        <Button
          className="mt-2"
          disabled={!form.name || !form.category_id || create.isPending}
          onClick={() => create.mutate()}
        >
          Add item
        </Button>
      </DialogContent>
    </Dialog>
  );
}
