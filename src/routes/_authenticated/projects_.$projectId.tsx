import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Download, FileCheck2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { MEASUREMENT_METHODS, money, num, qty, withWastage, type Currency } from "@/lib/boq";
import { ROLE_LABELS, SEAT_ROLES, useAuth, type AppRole } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/projects_/$projectId")({
  head: () => ({
    meta: [
      { title: "Bill of Quantities — UZA Build" },
      { name: "description", content: "Project, house, floor and room quantities rolled up into a priced Bill of Quantities." },
      { property: "og:title", content: "Bill of Quantities — UZA Build" },
      { property: "og:description", content: "Project, house, floor and room quantities rolled up into a priced Bill of Quantities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectBoq,
});

type Line = {
  id: string;
  room_id: string | null;
  description: string;
  unit: string;
  measurement_method: string;
  measurement_note: string | null;
  base_quantity: number | string;
  wastage_pct: number | string;
  quantity: number | string;
  pinned_rate: number | string | null;
  catalog_item_id: string | null;
};

function ProjectBoq() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { user, roles, fullName } = useAuth();
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: houses = [] } = useQuery({
    queryKey: ["houses", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("houses").select("*").eq("project_id", projectId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: floors = [] } = useQuery({
    queryKey: ["floors", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("floors").select("*").eq("project_id", projectId).order("level");
      if (error) throw error;
      return data;
    },
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("project_id", projectId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["boq-lines", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("boq_lines").select("*").eq("project_id", projectId).order("created_at");
      if (error) throw error;
      return data as unknown as Line[];
    },
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalog_items").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("approvals").select("*").eq("project_id", projectId).order("approved_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const currency = (project?.currency ?? "RWF") as Currency;

  const rateFor = (line: Line) => {
    if (line.pinned_rate !== null && line.pinned_rate !== undefined) return num(line.pinned_rate);
    const item = catalog.find((c) => c.id === line.catalog_item_id);
    return num(item?.price);
  };
  const amountFor = (line: Line) => num(line.quantity) * rateFor(line);

  const roomTotal = (roomId: string) => lines.filter((l) => l.room_id === roomId).reduce((s, l) => s + amountFor(l), 0);
  const floorTotal = (floorId: string) =>
    rooms.filter((r) => r.floor_id === floorId).reduce((s, r) => s + roomTotal(r.id), 0);
  const houseTotal = (houseId: string) =>
    floors.filter((f) => f.house_id === houseId).reduce((s, f) => s + floorTotal(f.id), 0);
  const projectTotal = useMemo(
    () => houses.reduce((s, h) => s + houseTotal(h.id) * (h.quantity || 1), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [houses, floors, rooms, lines, catalog],
  );

  const addHouse = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("houses").insert({ project_id: projectId, name, sort_order: houses.length });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["houses", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const addFloor = useMutation({
    mutationFn: async (v: { houseId: string; name: string; level: number }) => {
      const { error } = await supabase
        .from("floors")
        .insert({ project_id: projectId, house_id: v.houseId, name: v.name, level: v.level });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["floors", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const addRoom = useMutation({
    mutationFn: async (v: { floorId: string; name: string; area: number }) => {
      const { error } = await supabase
        .from("rooms")
        .insert({ project_id: projectId, floor_id: v.floorId, name: v.name, floor_area_m2: v.area });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rooms", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLine = useMutation({
    mutationFn: async (v: Partial<Line> & { id: string }) => {
      const base = num(v.base_quantity);
      const wast = num(v.wastage_pct);
      const { error } = await supabase
        .from("boq_lines")
        .update({
          base_quantity: base,
          wastage_pct: wast,
          quantity: withWastage(base, wast),
          measurement_method: v.measurement_method ?? "area",
          measurement_note: v.measurement_note ?? null,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["boq-lines", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("boq_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["boq-lines", projectId] }),
  });

  const addLine = useMutation({
    mutationFn: async (v: { roomId: string; itemId: string; base: number; method: string; note: string }) => {
      const room = rooms.find((r) => r.id === v.roomId)!;
      const item = catalog.find((c) => c.id === v.itemId)!;
      const wast = num(item.default_wastage_pct);
      const { error } = await supabase.from("boq_lines").insert({
        project_id: projectId,
        room_id: v.roomId,
        floor_id: room.floor_id,
        house_id: floors.find((f) => f.id === room.floor_id)?.house_id ?? null,
        catalog_item_id: v.itemId,
        description: item.name,
        unit: item.unit,
        measurement_method: v.method,
        measurement_note: v.note || null,
        base_quantity: v.base,
        wastage_pct: wast,
        quantity: withWastage(v.base, wast),
        currency,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Line added.");
      void queryClient.invalidateQueries({ queryKey: ["boq-lines", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (v: { role: AppRole; stage: string; notes: string }) => {
      const { error } = await supabase.from("approvals").insert({
        project_id: projectId,
        role: v.role,
        stage: v.stage,
        approved_by: user!.id,
        approver_name: fullName || user!.email || null,
        notes: v.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sign-off recorded.");
      void queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv(withRates: boolean) {
    const rows: string[][] = [
      withRates
        ? ["House", "Floor", "Room", "Description", "Unit", "Method", "Qty", "Rate", "Amount", "Currency"]
        : ["House", "Floor", "Room", "Description", "Unit", "Method", "Qty", "Rate", "Amount"],
    ];
    for (const h of houses) {
      for (const f of floors.filter((x) => x.house_id === h.id)) {
        for (const r of rooms.filter((x) => x.floor_id === f.id)) {
          for (const l of lines.filter((x) => x.room_id === r.id)) {
            const base = [h.name, f.name, r.name, l.description, l.unit, l.measurement_method, qty(l.quantity)];
            rows.push(
              withRates
                ? [...base, String(rateFor(l)), String(amountFor(l)), currency]
                : [...base, "", ""],
            );
          }
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "boq"}${withRates ? "" : "-blank-rate"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/projects">
          <ArrowLeft className="size-4" /> All projects
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-muted-foreground">
            {[project?.client_name, project?.location].filter(Boolean).join(" · ") || "Bill of Quantities"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Project total</p>
          <p className="tabular text-3xl font-semibold">{money(projectTotal, currency)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => exportCsv(true)}>
          <Download className="size-4" /> Export priced BOQ
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportCsv(false)}>
          <Download className="size-4" /> Export blank-rate BOQ
        </Button>
        <AddNode label="Add house" fields={["Name"]} onSubmit={(v) => addHouse.mutate(v[0] ?? "")} />
      </div>

      {houses.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Start the structure: add a house, then floors, then rooms.
          </CardContent>
        </Card>
      )}

      {houses.map((h) => (
        <Card key={h.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{h.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {h.quantity > 1 ? `${h.quantity} units · ` : ""}House total
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular text-lg font-semibold">{money(houseTotal(h.id) * (h.quantity || 1), currency)}</span>
              <AddNode
                label="Add floor"
                fields={["Name", "Level"]}
                onSubmit={(v) => addFloor.mutate({ houseId: h.id, name: v[0] ?? "", level: Number(v[1] || 0) })}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {floors
              .filter((f) => f.house_id === h.id)
              .map((f) => (
                <div key={f.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                    <p className="font-medium">{f.name}</p>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-sm">{money(floorTotal(f.id), currency)}</span>
                      <AddNode
                        label="Add room"
                        fields={["Name", "Floor area m2"]}
                        onSubmit={(v) => addRoom.mutate({ floorId: f.id, name: v[0] ?? "", area: Number(v[1] || 0) })}
                      />
                    </div>
                  </div>
                  <div className="divide-y">
                    {rooms
                      .filter((r) => r.floor_id === f.id)
                      .map((r) => {
                        const roomLines = lines.filter((l) => l.room_id === r.id);
                        const isOpen = openRoom === r.id;
                        return (
                          <div key={r.id}>
                            <button
                              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
                              onClick={() => setOpenRoom(isOpen ? null : r.id)}
                            >
                              <span>
                                <span className="font-medium">{r.name}</span>
                                <span className="ml-2 text-sm text-muted-foreground">
                                  {qty(r.floor_area_m2)} m² · {roomLines.length} lines
                                </span>
                              </span>
                              <span className="tabular text-sm font-medium">{money(roomTotal(r.id), currency)}</span>
                            </button>
                            {isOpen && (
                              <div className="space-y-3 bg-muted/20 px-4 pb-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Item</TableHead>
                                      <TableHead>Method</TableHead>
                                      <TableHead className="w-24">Base</TableHead>
                                      <TableHead className="w-20">Waste %</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Rate</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                      <TableHead />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {roomLines.map((l) => (
                                      <LineRow
                                        key={l.id}
                                        line={l}
                                        rate={rateFor(l)}
                                        currency={currency}
                                        onSave={(v) => saveLine.mutate({ id: l.id, ...v })}
                                        onDelete={() => deleteLine.mutate(l.id)}
                                      />
                                    ))}
                                    {roomLines.length === 0 && (
                                      <TableRow>
                                        <TableCell colSpan={8} className="py-4 text-center text-sm text-muted-foreground">
                                          No lines in this room yet.
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                                <AddLineDialog
                                  catalog={catalog}
                                  roomArea={num(r.floor_area_m2)}
                                  onSubmit={(v) => addLine.mutate({ roomId: r.id, ...v })}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {rooms.filter((r) => r.floor_id === f.id).length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No rooms on this floor yet.</p>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-accent" /> Sign-off
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nothing is final until the responsible human approves it. You can only sign off in your own seat.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEAT_ROLES.map((r) => {
              const done = approvals.filter((a) => a.role === r);
              const mine = roles.includes(r);
              return (
                <div key={r} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{ROLE_LABELS[r]}</p>
                    {done.length > 0 ? (
                      <Badge>Signed off</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </div>
                  {done.slice(0, 2).map((a) => (
                    <p key={a.id} className="mt-1 text-xs text-muted-foreground">
                      {a.approver_name} · {a.stage} · {new Date(a.approved_at).toLocaleDateString()}
                    </p>
                  ))}
                  {mine && (
                    <ApproveDialog
                      role={r}
                      onSubmit={(stage, notes) => approve.mutate({ role: r, stage, notes })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LineRow({
  line,
  rate,
  currency,
  onSave,
  onDelete,
}: {
  line: Line;
  rate: number;
  currency: Currency;
  onSave: (v: { base_quantity: number; wastage_pct: number; measurement_method: string; measurement_note: string }) => void;
  onDelete: () => void;
}) {
  const [base, setBase] = useState(String(num(line.base_quantity)));
  const [waste, setWaste] = useState(String(num(line.wastage_pct)));
  const [method, setMethod] = useState(line.measurement_method);
  const quantity = withWastage(num(base), num(waste));

  function commit() {
    onSave({
      base_quantity: num(base),
      wastage_pct: num(waste),
      measurement_method: method,
      measurement_note: line.measurement_note ?? "",
    });
  }

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{line.description}</p>
        <p className="text-xs text-muted-foreground">
          {line.unit}
          {line.measurement_note ? ` · ${line.measurement_note}` : ""}
        </p>
      </TableCell>
      <TableCell>
        <Select
          value={method}
          onValueChange={(v) => {
            setMethod(v);
            onSave({
              base_quantity: num(base),
              wastage_pct: num(waste),
              measurement_method: v,
              measurement_note: line.measurement_note ?? "",
            });
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEASUREMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input className="h-8" value={base} onChange={(e) => setBase(e.target.value)} onBlur={commit} />
      </TableCell>
      <TableCell>
        <Input className="h-8" value={waste} onChange={(e) => setWaste(e.target.value)} onBlur={commit} />
      </TableCell>
      <TableCell className="tabular text-right">{qty(quantity)}</TableCell>
      <TableCell className="tabular text-right">{money(rate, currency)}</TableCell>
      <TableCell className="tabular text-right font-medium">{money(quantity * rate, currency)}</TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddNode({
  label,
  fields,
  onSubmit,
}: {
  label: string;
  fields: string[];
  onSubmit: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>(fields.map(() => ""));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="size-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f} className="space-y-2">
              <Label>{f}</Label>
              <Input
                value={values[i]}
                onChange={(e) => setValues(values.map((v, j) => (i === j ? e.target.value : v)))}
              />
            </div>
          ))}
          <Button
            className="w-full"
            disabled={!values[0]}
            onClick={() => {
              onSubmit(values);
              setValues(fields.map(() => ""));
              setOpen(false);
            }}
          >
            {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddLineDialog({
  catalog,
  roomArea,
  onSubmit,
}: {
  catalog: { id: string; name: string; unit: string; coverage_per_unit: number | string | null }[];
  roomArea: number;
  onSubmit: (v: { itemId: string; base: number; method: string; note: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [method, setMethod] = useState("area");
  const [base, setBase] = useState("");
  const [note, setNote] = useState("");

  const item = catalog.find((c) => c.id === itemId);

  function autofill(nextMethod: string) {
    setMethod(nextMethod);
    if (nextMethod === "area" && item) {
      const coverage = num(item.coverage_per_unit) || 1;
      setBase(String(roomArea / coverage));
      setNote(`${qty(roomArea)} m² ÷ ${qty(coverage)} coverage per ${item.unit}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add line item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add line item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Catalog item</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                setBase("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Measurement method</Label>
            <Select value={method} onValueChange={autofill}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEASUREMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Base quantity</Label>
            <Input value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>How this number was reached</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button
            className="w-full"
            disabled={!itemId || !base}
            onClick={() => {
              onSubmit({ itemId, base: num(base), method, note });
              setOpen(false);
              setItemId("");
              setBase("");
              setNote("");
            }}
          >
            Add to room
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ role, onSubmit }: { role: AppRole; onSubmit: (stage: string, notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("BOQ");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mt-3">
          Sign off as {ROLE_LABELS[role]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record sign-off</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Input value={stage} onChange={(e) => setStage(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <Button
            className="w-full"
            onClick={() => {
              onSubmit(stage, notes);
              setOpen(false);
            }}
          >
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
