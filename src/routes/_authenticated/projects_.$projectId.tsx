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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEASUREMENT_METHODS, money, num, qty, withWastage, type Currency } from "@/lib/boq";
import { ROLE_LABELS, SEAT_ROLES, useAuth, type AppRole } from "@/context/AuthContext";
import { stageLabel } from "@/components/project/StageMachine";
import { boqItemNo, statusLabel, statusVariant } from "@/lib/project-status";
import { StageApprovals } from "@/components/project/StageApprovals";
import { DocumentsPanel } from "@/components/project/DocumentsPanel";
import { TakeoffPanel } from "@/components/project/TakeoffPanel";
import { SolarPanel } from "@/components/project/SolarPanel";
import { ProposalPanel } from "@/components/project/ProposalPanel";
import { PackagesPanel } from "@/components/project/PackagesPanel";
import { ProcurementPanel } from "@/components/project/ProcurementPanel";
import { DiscoveryPanel } from "@/components/project/DiscoveryPanel";
import { CoordinationPanel } from "@/components/project/CoordinationPanel";
import { ProformaPanel } from "@/components/project/ProformaPanel";
import { toMinor } from "@/lib/pricing";
import { downloadBoqWorkbook, type XlsxLine, type XlsxRollup } from "@/lib/boq-xlsx";
import { InvitePanel } from "@/components/project/InvitePanel";
import type { ProjectStageKey } from "@/config/policy";


export const Route = createFileRoute("/_authenticated/projects_/$projectId")({
  head: () => ({
    meta: [
      { title: "Bill of Quantities — UZA Build" },
      {
        name: "description",
        content:
          "Project, house, floor and room quantities rolled up into a priced Bill of Quantities.",
      },
      { property: "og:title", content: "Bill of Quantities — UZA Build" },
      {
        property: "og:description",
        content:
          "Project, house, floor and room quantities rolled up into a priced Bill of Quantities.",
      },
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
  const { user, roles, fullName, isCostBlind } = useAuth();
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: latestBoqVersion } = useQuery({
    queryKey: ["boq-version-ref", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_versions")
        .select("reference, version_no")
        .eq("project_id", projectId)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const boqReference = latestBoqVersion?.reference ?? null;

  const { data: houses = [] } = useQuery({
    queryKey: ["houses", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("houses")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: floors = [] } = useQuery({
    queryKey: ["floors", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("floors")
        .select("*")
        .eq("project_id", projectId)
        .order("level");
      if (error) throw error;
      return data;
    },
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["boq-lines", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_lines")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error) throw error;
      return data as unknown as Line[];
    },
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_items")
        .select("*")
        .eq("is_active", true)
        .order("name");
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

  const roomTotal = (roomId: string) =>
    lines.filter((l) => l.room_id === roomId).reduce((s, l) => s + amountFor(l), 0);
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
      const { error } = await supabase
        .from("houses")
        .insert({ project_id: projectId, name, sort_order: houses.length });
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
      const { error } = await supabase.from("rooms").insert({
        project_id: projectId,
        floor_id: v.floorId,
        name: v.name,
        floor_area_m2: v.area,
      });
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
    mutationFn: async (v: {
      roomId: string;
      itemId: string;
      base: number;
      method: string;
      note: string;
    }) => {
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

  function exportCsv(withRates: boolean) {
    const rows: string[][] = [
      withRates
        ? [
            "House",
            "Floor",
            "Room",
            "Description",
            "Unit",
            "Method",
            "Qty",
            "Rate",
            "Amount",
            "Currency",
          ]
        : ["House", "Floor", "Room", "Description", "Unit", "Method", "Qty", "Rate", "Amount"],
    ];
    for (const h of houses) {
      for (const f of floors.filter((x) => x.house_id === h.id)) {
        for (const r of rooms.filter((x) => x.floor_id === f.id)) {
          for (const l of lines.filter((x) => x.room_id === r.id)) {
            const base = [
              h.name,
              f.name,
              r.name,
              l.description,
              l.unit,
              l.measurement_method,
              qty(l.quantity),
            ];
            rows.push(
              withRates
                ? [...base, String(rateFor(l)), String(amountFor(l)), currency]
                : [...base, "", ""],
            );
          }
        }
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "boq"}${withRates ? "" : "-blank-rate"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx(withRates: boolean) {
    const xlsxLines: XlsxLine[] = [];
    const rollups: XlsxRollup[] = [];
    for (const h of houses) {
      rollups.push({ level: "House", name: h.name, parent: project?.name ?? "", amount: houseTotal(h.id) * (h.quantity || 1) });
      for (const f of floors.filter((x) => x.house_id === h.id)) {
        rollups.push({ level: "Floor", name: f.name, parent: h.name, amount: floorTotal(f.id) });
        for (const r of rooms.filter((x) => x.floor_id === f.id)) {
          rollups.push({ level: "Room", name: r.name, parent: `${h.name} / ${f.name}`, amount: roomTotal(r.id) });
          for (const l of lines.filter((x) => x.room_id === r.id)) {
            const item = catalog.find((c) => c.id === l.catalog_item_id);
            xlsxLines.push({
              house: h.name,
              floor: f.name,
              room: r.name,
              description: l.description,
              catalogItem: item?.name ?? "",
              supplier: item?.supplier ?? "",
              unit: l.unit,
              measurementMethod: l.measurement_method,
              measurementNote: l.measurement_note ?? "",
              baseQuantity: num(l.base_quantity),
              wastagePct: num(l.wastage_pct),
              quantity: num(l.quantity),
              catalogRate: num(item?.price),
              pinnedRate: l.pinned_rate === null || l.pinned_rate === undefined ? null : num(l.pinned_rate),
              appliedRate: rateFor(l),
              amount: amountFor(l),
            });
          }
        }
      }
    }
    downloadBoqWorkbook({
      projectName: project?.name ?? "Project",
      clientName: project?.client_name ?? "",
      location: project?.location ?? "",
      currency,
      generatedBy: fullName || user?.email || "",
      generatedAt: new Date(),
      lines: xlsxLines,
      rollups,
      projectTotal,
      withRates,
    });
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="tabular rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => {
                if (!project?.project_code) return;
                void navigator.clipboard.writeText(project.project_code);
                toast.success("Project number copied.");
              }}
              title="Copy the project number"
            >
              {project?.project_code ?? "—"}
            </button>
            <Badge variant={statusVariant(project?.status)}>{statusLabel(project?.status)}</Badge>
            <Badge variant="secondary">{stageLabel(project?.current_stage ?? "intake")}</Badge>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-muted-foreground">
            {[project?.client_name, project?.location].filter(Boolean).join(" · ") ||
              "Bill of Quantities"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Project total</p>
          <p className="tabular text-3xl font-semibold">{money(projectTotal, currency)}</p>
        </div>
      </div>

      <Tabs defaultValue={isCostBlind ? "proposal" : "overview"} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {!isCostBlind && <TabsTrigger value="overview">Overview</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="discovery">Client brief</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="coordination">Discussions</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="documents">Drawings</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="takeoff">Takeoff</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="boq">BOQ</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="packages">Packages</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="solar">Solar</TabsTrigger>}
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
          {!isCostBlind && <TabsTrigger value="procurement">Procurement</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="proforma">Proforma</TabsTrigger>}
          {!isCostBlind && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>


        {!isCostBlind && (
          <TabsContent value="overview" className="space-y-6">
            <StageApprovals
              projectId={projectId}
              currentStage={project?.current_stage ?? "intake"}
            />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="discovery">
            <DiscoveryPanel projectId={projectId} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="coordination">
            <CoordinationPanel projectId={projectId} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="documents">
            <DocumentsPanel projectId={projectId} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="takeoff">
            <TakeoffPanel projectId={projectId} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="solar">
            <SolarPanel projectId={projectId} />
          </TabsContent>
        )}

        <TabsContent value="proposal">
          <ProposalPanel
            projectId={projectId}
            currency={currency}
            projectName={project?.name ?? "Project"}
            suggestedPriceMinor={toMinor(projectTotal, currency)}
          />
        </TabsContent>

        {!isCostBlind && (
          <TabsContent value="packages">
            <PackagesPanel projectId={projectId} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="procurement">
            <ProcurementPanel projectId={projectId} currency={currency} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="proforma">
            <ProformaPanel projectId={projectId} projectName={project?.name ?? "Project"} />
          </TabsContent>
        )}

        {!isCostBlind && (
          <TabsContent value="team">
            <InvitePanel projectId={projectId} />
          </TabsContent>
        )}

        <TabsContent value="boq" className="space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  BOQ reference
                </p>
                <p className="tabular text-lg font-semibold">
                  {boqReference ?? `${project?.project_code ?? "—"}/BOQ-V01`}
                </p>
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                Every line is numbered house.floor.room.line so the printed BOQ, the proforma and
                the site copy all refer to the same item under this project number.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportXlsx(true)}>
              <Download className="size-4" /> Export priced BOQ (Excel)
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx(false)}>
              <Download className="size-4" /> Export blank-rate BOQ (Excel)
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(true)}>
              <Download className="size-4" /> Priced CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(false)}>
              <Download className="size-4" /> Blank-rate CSV
            </Button>

            <AddNode
              label="Add house"
              fields={["Name"]}
              onSubmit={(v) => addHouse.mutate(v[0] ?? "")}
            />
          </div>

          {houses.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Start the structure: add a house, then floors, then rooms.
              </CardContent>
            </Card>
          )}

          {houses.map((h, hi) => (
            <Card key={h.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{h.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {h.quantity > 1 ? `${h.quantity} units · ` : ""}House total
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-lg font-semibold">
                    {money(houseTotal(h.id) * (h.quantity || 1), currency)}
                  </span>
                  <AddNode
                    label="Add floor"
                    fields={["Name", "Level"]}
                    onSubmit={(v) =>
                      addFloor.mutate({ houseId: h.id, name: v[0] ?? "", level: Number(v[1] || 0) })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {floors
                  .filter((f) => f.house_id === h.id)
                  .map((f, fi) => (
                    <div key={f.id} className="rounded-lg border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                        <p className="font-medium">{f.name}</p>
                        <div className="flex items-center gap-3">
                          <span className="tabular text-sm">
                            {money(floorTotal(f.id), currency)}
                          </span>
                          <AddNode
                            label="Add room"
                            fields={["Name", "Floor area m2"]}
                            onSubmit={(v) =>
                              addRoom.mutate({
                                floorId: f.id,
                                name: v[0] ?? "",
                                area: Number(v[1] || 0),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="divide-y">
                        {rooms
                          .filter((r) => r.floor_id === f.id)
                          .map((r, ri) => {
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
                                  <span className="tabular text-sm font-medium">
                                    {money(roomTotal(r.id), currency)}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="space-y-3 bg-muted/20 px-4 pb-4">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-24">No.</TableHead>
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
                                        {roomLines.map((l, li) => (
                                          <LineRow
                                            key={l.id}
                                            itemNo={boqItemNo(hi + 1, fi + 1, ri + 1, li + 1)}
                                            line={l}
                                            rate={rateFor(l)}
                                            currency={currency}
                                            onSave={(v) => saveLine.mutate({ id: l.id, ...v })}
                                            onDelete={() => deleteLine.mutate(l.id)}
                                          />
                                        ))}
                                        {roomLines.length === 0 && (
                                          <TableRow>
                                            <TableCell
                                              colSpan={9}
                                              className="py-4 text-center text-sm text-muted-foreground"
                                            >
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
                          <p className="px-4 py-3 text-sm text-muted-foreground">
                            No rooms on this floor yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LineRow({
  itemNo,
  line,
  rate,
  currency,
  onSave,
  onDelete,
}: {
  itemNo: string;
  line: Line;
  rate: number;
  currency: Currency;
  onSave: (v: {
    base_quantity: number;
    wastage_pct: number;
    measurement_method: string;
    measurement_note: string;
  }) => void;
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
      <TableCell className="tabular align-top text-xs text-muted-foreground">{itemNo}</TableCell>
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
        <Input
          className="h-8"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          onBlur={commit}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8"
          value={waste}
          onChange={(e) => setWaste(e.target.value)}
          onBlur={commit}
        />
      </TableCell>
      <TableCell className="tabular text-right">{qty(quantity)}</TableCell>
      <TableCell className="tabular text-right">{money(rate, currency)}</TableCell>
      <TableCell className="tabular text-right font-medium">
        {money(quantity * rate, currency)}
      </TableCell>
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
              <Label htmlFor={`quick-field-${i}`}>{f}</Label>
              <Input
                id={`quick-field-${i}`}
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

  /** Fill the quantity from the room area so nobody types a number by hand for a plain area measure. */
  function fillFromArea(
    forItem: { unit: string; coverage_per_unit: number | string | null } | undefined,
  ) {
    if (!forItem || roomArea <= 0) return;
    const coverage = num(forItem.coverage_per_unit) || 1;
    setBase(String(roomArea / coverage));
    setNote(`${qty(roomArea)} m² ÷ ${qty(coverage)} coverage per ${forItem.unit}`);
  }

  function autofill(nextMethod: string) {
    setMethod(nextMethod);
    if (nextMethod === "area") fillFromArea(item);
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
            <Label htmlFor="line-item">Catalog item</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                setBase("");
                if (method === "area") fillFromArea(catalog.find((c) => c.id === v));
              }}
            >
              <SelectTrigger id="line-item">

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
            <Label htmlFor="line-method">Measurement method</Label>
            <Select value={method} onValueChange={autofill}>
              <SelectTrigger id="line-method">
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
            <Label htmlFor="line-base">Base quantity</Label>
            <Input id="line-base" value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-note">How this number was reached</Label>
            <Textarea id="line-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
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
