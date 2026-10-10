/**
 * Loads what the takeoff → BOQ plan needs and writes the plan the QS confirmed.
 *
 * The decisions live in src/lib/takeoff-to-boq.ts (pure, tested). This module
 * only reads and writes, in hierarchy order — house, floors, rooms, then BOQ
 * lines with takeoff_line_id set — so a line is never left outside a room
 * (a BOQ line without a room is invisible in every total).
 */
import { supabase } from "@/integrations/supabase/client";
import { withWastage } from "@/lib/boq";
import type {
  CatalogItemInput,
  CategoryInput,
  FloorInput,
  HouseInput,
  PlannedLine,
  RoomInput,
  TakeoffPlan,
} from "@/lib/takeoff-to-boq";

export type BoqContext = {
  currency: string;
  houses: HouseInput[];
  floors: FloorInput[];
  rooms: RoomInput[];
  items: CatalogItemInput[];
  categories: CategoryInput[];
  alreadyInBoq: Set<string>;
  boqLineCount: number;
};

export async function loadBoqContext(projectId: string): Promise<BoqContext> {
  const [project, houses, floors, rooms, items, categories, linked] = await Promise.all([
    supabase.from("projects").select("currency").eq("id", projectId).maybeSingle(),
    supabase.from("houses").select("id, name, sort_order").eq("project_id", projectId),
    supabase.from("floors").select("id, house_id, name, level").eq("project_id", projectId),
    supabase.from("rooms").select("id, floor_id, name").eq("project_id", projectId),
    supabase
      .from("catalog_items")
      .select("id, category_id, name, unit, default_wastage_pct, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase.from("catalog_categories").select("id, name, slug").order("sort_order"),
    supabase.from("boq_lines").select("takeoff_line_id").eq("project_id", projectId),
  ]);
  for (const r of [project, houses, floors, rooms, items, categories, linked]) {
    if (r.error) throw r.error;
  }
  const links = linked.data ?? [];
  return {
    currency: project.data?.currency ?? "RWF",
    houses: houses.data ?? [],
    floors: floors.data ?? [],
    rooms: rooms.data ?? [],
    items: (items.data ?? []) as CatalogItemInput[],
    categories: categories.data ?? [],
    alreadyInBoq: new Set(links.map((l) => l.takeoff_line_id).filter((id): id is string => !!id)),
    boqLineCount: links.length,
  };
}

/**
 * Writes the confirmed plan. `lines` is the QS's final version (room and item
 * possibly changed per line). Only new floors/rooms that some line lands in are
 * created. Returns how many BOQ lines were written.
 */
export async function writeTakeoffPlan(input: {
  projectId: string;
  plan: TakeoffPlan;
  lines: PlannedLine[];
  context: BoqContext;
}): Promise<{ written: number; roomsCreated: number }> {
  const { projectId, plan, lines, context } = input;
  if (lines.length === 0) return { written: 0, roomsCreated: 0 };

  // Fresh check against double-sending from two tabs.
  const ids = lines.map((l) => l.takeoffLineId);
  const { data: already, error: alreadyErr } = await supabase
    .from("boq_lines")
    .select("takeoff_line_id")
    .eq("project_id", projectId)
    .in("takeoff_line_id", ids);
  if (alreadyErr) throw alreadyErr;
  const sent = new Set((already ?? []).map((r) => r.takeoff_line_id));
  const toWrite = lines.filter((l) => !sent.has(l.takeoffLineId));
  if (toWrite.length === 0) return { written: 0, roomsCreated: 0 };

  const usedRooms = new Set(toWrite.map((l) => l.roomKey));
  const neededRooms = plan.newRooms.filter((r) => usedRooms.has(r.key));
  const neededFloors = plan.newFloors.filter((f) => neededRooms.some((r) => r.floorRef === f.key));

  const ref = new Map<string, string>(); // plan key -> real id
  for (const h of context.houses) ref.set(`house:${h.id}`, h.id);
  for (const f of context.floors) ref.set(`floor:${f.id}`, f.id);
  for (const r of context.rooms) ref.set(`room:${r.id}`, r.id);

  if (plan.newHouse && neededFloors.some((f) => f.houseRef === plan.newHouse!.key)) {
    const { data, error } = await supabase
      .from("houses")
      .insert({
        project_id: projectId,
        name: plan.newHouse.name,
        sort_order: context.houses.length,
      })
      .select("id")
      .single();
    if (error) throw error;
    ref.set(plan.newHouse.key, data.id);
  }

  for (const f of neededFloors) {
    const houseId = ref.get(f.houseRef);
    if (!houseId) throw new Error("Could not place a new floor: its building is missing.");
    const { data, error } = await supabase
      .from("floors")
      .insert({ project_id: projectId, house_id: houseId, name: f.name, level: f.level })
      .select("id")
      .single();
    if (error) throw error;
    ref.set(f.key, data.id);
  }

  for (const [i, r] of neededRooms.entries()) {
    const floorId = ref.get(r.floorRef);
    if (!floorId) throw new Error(`Could not place room "${r.name}": its floor is missing.`);
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        project_id: projectId,
        floor_id: floorId,
        name: r.name,
        floor_area_m2: r.floor_area_m2,
        wall_area_m2: r.wall_area_m2,
        perimeter_m: r.perimeter_m,
        sort_order: context.rooms.length + i,
      })
      .select("id")
      .single();
    if (error) throw error;
    ref.set(r.key, data.id);
  }

  const floorOfRoom = new Map<string, string>();
  for (const r of context.rooms) floorOfRoom.set(r.id, r.floor_id);
  for (const r of neededRooms) floorOfRoom.set(ref.get(r.key)!, ref.get(r.floorRef)!);
  const houseOfFloor = new Map<string, string>();
  for (const f of context.floors) houseOfFloor.set(f.id, f.house_id);
  for (const f of neededFloors) houseOfFloor.set(ref.get(f.key)!, ref.get(f.houseRef)!);

  const itemById = new Map(context.items.map((i) => [i.id, i]));
  const rows = toWrite.map((l, i) => {
    const roomId = ref.get(l.roomKey);
    if (!roomId) throw new Error(`No room for "${l.label}".`);
    const floorId = floorOfRoom.get(roomId) ?? null;
    const item = l.catalogItemId ? itemById.get(l.catalogItemId) : undefined;
    return {
      project_id: projectId,
      room_id: roomId,
      floor_id: floorId,
      house_id: floorId ? (houseOfFloor.get(floorId) ?? null) : null,
      catalog_item_id: item?.id ?? null,
      takeoff_line_id: l.takeoffLineId,
      description: item?.name ?? l.label,
      unit: item?.unit ?? l.unit,
      measurement_method: l.measurementMethod,
      measurement_note: l.note,
      base_quantity: l.baseQuantity,
      wastage_pct: l.wastagePct,
      quantity: withWastage(l.baseQuantity, l.wastagePct),
      currency: context.currency as "RWF" | "USD" | "CNY",
      source: "takeoff",
      sort_order: context.boqLineCount + i,
    };
  });

  const { error } = await supabase.from("boq_lines").insert(rows);
  if (error) throw error;
  return { written: rows.length, roomsCreated: neededRooms.length };
}

/** The learning loop: one training record per reviewed takeoff line. */
export async function recordTakeoffTraining(input: {
  projectId: string;
  userId: string | null;
  line: {
    id: string;
    description: string;
    unit: string;
    material_category: string | null;
    ai_quantity: number | string | null;
    ai_confidence: number | string | null;
    ai_source: string | null;
  };
  finalQuantity: number;
  reason: string;
  accepted: boolean;
}) {
  const ai = input.line.ai_quantity === null ? null : Number(input.line.ai_quantity);
  const { error } = await supabase.from("training_records").insert({
    project_id: input.projectId,
    stage: "takeoff",
    role_tag: "qs",
    ai_draft: {
      takeoff_line_id: input.line.id,
      description: input.line.description,
      unit: input.line.unit,
      material_category: input.line.material_category,
      quantity: ai,
      confidence: input.line.ai_confidence === null ? null : Number(input.line.ai_confidence),
      source: input.line.ai_source,
    },
    human_final: { quantity: input.finalQuantity, accepted: input.accepted, reason: input.reason },
    diff: {
      field: "quantity",
      before: ai,
      after: input.finalQuantity,
      delta: ai === null ? null : input.finalQuantity - ai,
      pct: ai ? Math.round(((input.finalQuantity - ai) / ai) * 10000) / 100 : null,
    },
    captured_by: input.userId,
  });
  if (error) throw error;
}
