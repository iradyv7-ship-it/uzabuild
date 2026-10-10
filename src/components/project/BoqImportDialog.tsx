import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { methodForUnit, readBoqSpreadsheet, type ImportedBoqRow } from "@/lib/boq-import.functions";

type Draft = ImportedBoqRow & { include: boolean; key: number };

const DEFAULT_HOUSE = "Main";
const DEFAULT_FLOOR = "General";
const DEFAULT_ROOM = "General";

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Previews an imported BOQ spreadsheet and, on confirm, writes it into the
 * project's house → floor → room → line structure. Houses, floors and rooms
 * are matched by name and created when missing; a line is linked to a catalog
 * item only on an exact name or code match. A printed rate is kept as the
 * line's pinned rate only when it is in the project currency — otherwise it is
 * noted on the line and the QS prices it.
 */
export function BoqImportDialog({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  drawing: { id: string; file_name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const read = useServerFn(readBoqSpreadsheet);
  const [rows, setRows] = useState<Draft[]>([]);

  const load = useMutation({
    mutationFn: () => read({ data: { drawingId: drawing.id } }),
    onSuccess: (result) =>
      setRows(
        result.rows.map((r, i) => ({
          ...r,
          key: i,
          include: r.quantity !== null && r.quantity > 0,
        })),
      ),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not read that spreadsheet."),
  });

  useEffect(() => {
    load.mutate();
    // Read once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id]);

  const included = rows.filter((r) => r.include);
  const groups = useMemo(
    () =>
      new Set(
        included.map(
          (r) =>
            `${r.house || DEFAULT_HOUSE} / ${r.floor || DEFAULT_FLOOR} / ${r.room || DEFAULT_ROOM}`,
        ),
      ).size,
    [included],
  );

  const commit = useMutation({
    mutationFn: async () => {
      if (included.length === 0) throw new Error("Select at least one line to import.");

      const [{ data: project, error: pErr }, houses, floors, rooms, catalog, existing] =
        await Promise.all([
          supabase.from("projects").select("currency").eq("id", projectId).maybeSingle(),
          supabase.from("houses").select("id, name").eq("project_id", projectId),
          supabase.from("floors").select("id, name, house_id, level").eq("project_id", projectId),
          supabase.from("rooms").select("id, name, floor_id").eq("project_id", projectId),
          supabase.from("catalog_items").select("id, name, code"),
          supabase
            .from("boq_lines")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId),
        ]);
      if (pErr) throw pErr;
      for (const r of [houses, floors, rooms]) if (r.error) throw r.error;
      const currency = (project?.currency ?? "RWF") as "RWF" | "USD" | "CNY";

      const houseIds = new Map((houses.data ?? []).map((h) => [key(h.name), h.id]));
      const floorIds = new Map(
        (floors.data ?? []).map((f) => [`${f.house_id}|${key(f.name)}`, f.id]),
      );
      const roomIds = new Map(
        (rooms.data ?? []).map((r) => [`${r.floor_id}|${key(r.name)}`, r.id]),
      );
      const floorHouse = new Map((floors.data ?? []).map((f) => [f.id, f.house_id]));
      const byName = new Map((catalog.data ?? []).map((c) => [key(c.name), c.id]));
      const byCode = new Map(
        (catalog.data ?? []).filter((c) => c.code).map((c) => [key(c.code!), c.id]),
      );

      async function houseId(name: string) {
        const k = key(name);
        const found = houseIds.get(k);
        if (found) return found;
        const { data, error } = await supabase
          .from("houses")
          .insert({ project_id: projectId, name, sort_order: houseIds.size })
          .select("id")
          .single();
        if (error) throw error;
        houseIds.set(k, data.id);
        return data.id;
      }
      async function floorId(hId: string, name: string) {
        const k = `${hId}|${key(name)}`;
        const found = floorIds.get(k);
        if (found) return found;
        const level = [...floorIds.keys()].filter((x) => x.startsWith(`${hId}|`)).length;
        const { data, error } = await supabase
          .from("floors")
          .insert({ project_id: projectId, house_id: hId, name, level, sort_order: level })
          .select("id")
          .single();
        if (error) throw error;
        floorIds.set(k, data.id);
        floorHouse.set(data.id, hId);
        return data.id;
      }
      async function roomId(fId: string, name: string) {
        const k = `${fId}|${key(name)}`;
        const found = roomIds.get(k);
        if (found) return found;
        const { data, error } = await supabase
          .from("rooms")
          .insert({ project_id: projectId, floor_id: fId, name, sort_order: roomIds.size })
          .select("id")
          .single();
        if (error) throw error;
        roomIds.set(k, data.id);
        return data.id;
      }

      let sort = existing.count ?? 0;
      let foreignRates = 0;
      const inserts = [];
      for (const r of included) {
        const hId = await houseId(r.house || DEFAULT_HOUSE);
        const fId = await floorId(hId, r.floor || DEFAULT_FLOOR);
        const rId = await roomId(fId, r.room || DEFAULT_ROOM);
        const catalogId =
          (r.item_ref && byCode.get(key(r.item_ref))) || byName.get(key(r.description)) || null;
        const qty = r.quantity ?? 0;
        const rateUsable = r.rate !== null && (!r.currency || r.currency === currency);
        if (r.rate !== null && !rateUsable) foreignRates++;
        const note = [
          `Imported from ${drawing.file_name}${r.source_row ? ` row ${r.source_row}` : ""}`,
          r.item_ref ? `item ${r.item_ref}` : "",
          r.rate !== null && !rateUsable
            ? `printed rate ${r.rate} ${r.currency} — not in ${currency}, price it`
            : "",
        ]
          .filter(Boolean)
          .join(" · ");
        inserts.push({
          project_id: projectId,
          house_id: floorHouse.get(fId) ?? hId,
          floor_id: fId,
          room_id: rId,
          catalog_item_id: catalogId,
          description: r.item_ref ? `${r.item_ref} ${r.description}` : r.description,
          unit: r.unit || "each",
          measurement_method: methodForUnit(r.unit),
          measurement_note: note,
          base_quantity: qty,
          wastage_pct: 0,
          quantity: qty,
          pinned_rate: rateUsable ? r.rate : null,
          currency,
          source: "import",
          sort_order: sort++,
        });
      }

      for (let i = 0; i < inserts.length; i += 200) {
        const { error } = await supabase.from("boq_lines").insert(inserts.slice(i, i + 200));
        if (error) throw error;
      }
      return { lines: inserts.length, foreignRates };
    },
    onSuccess: ({ lines, foreignRates }) => {
      toast.success(
        `${lines} line(s) added to the BOQ.` +
          (foreignRates
            ? ` ${foreignRates} printed rate(s) were in another currency and are left for the QS to price.`
            : ""),
      );
      for (const k of ["houses", "floors", "rooms", "boq-lines"]) {
        void queryClient.invalidateQueries({ queryKey: [k, projectId] });
      }
      onClose();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "The import could not be saved."),
  });

  const update = (k: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  return (
    <Dialog open onOpenChange={(o) => !o && !commit.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-all">Import BOQ — {drawing.file_name}</DialogTitle>
          <DialogDescription>
            Every line below was read from the spreadsheet as printed — nothing is computed or
            invented, and blank rates stay blank. Check the lines, untick anything that is not an
            item, then add them to the BOQ. Houses, floors and rooms are matched by name and created
            when missing.
          </DialogDescription>
        </DialogHeader>

        {load.isPending && (
          <div className="space-y-2" aria-busy="true">
            <p className="text-sm text-muted-foreground">
              Reading the spreadsheet — large BOQs are read in parts…
            </p>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        {load.isError && (
          <div className="space-y-3 rounded-md border border-destructive/40 p-4 text-sm">
            <p>
              {load.error instanceof Error
                ? load.error.message
                : "The spreadsheet could not be read."}
            </p>
            <Button variant="outline" size="sm" onClick={() => load.mutate()}>
              Try again
            </Button>
          </div>
        )}

        {load.isSuccess && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{rows.length} rows read</Badge>
              <Badge variant="outline">{included.length} selected</Badge>
              <Badge variant="outline">{groups} room group(s)</Badge>
              {load.data.truncated && (
                <Badge variant="destructive">Workbook was cut — split it to import the rest</Badge>
              )}
              <Button
                variant="link"
                size="sm"
                onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}
              >
                Select all
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}
              >
                Select none
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No measurable items were found in this spreadsheet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Row</TableHead>
                      <TableHead>House / floor / room</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-24">Unit</TableHead>
                      <TableHead className="w-28 text-right">Quantity</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key} className={r.include ? "" : "opacity-50"}>
                        <TableCell>
                          <Checkbox
                            checked={r.include}
                            onCheckedChange={(v) => update(r.key, { include: v === true })}
                            aria-label={`Include ${r.description}`}
                          />
                        </TableCell>
                        <TableCell className="tabular text-xs text-muted-foreground">
                          {r.source_row ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[
                            r.house || DEFAULT_HOUSE,
                            r.floor || DEFAULT_FLOOR,
                            r.room || DEFAULT_ROOM,
                          ].join(" / ")}
                        </TableCell>
                        <TableCell className="max-w-md text-sm">
                          {r.item_ref && (
                            <span className="mr-1 font-mono text-xs text-muted-foreground">
                              {r.item_ref}
                            </span>
                          )}
                          {r.description}
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={r.unit}
                            onChange={(e) => update(r.key, { unit: e.target.value })}
                            aria-label="Unit"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="tabular h-8 text-right"
                            inputMode="decimal"
                            value={r.quantity ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const n = Number(v.replace(/,/g, ""));
                              update(r.key, {
                                quantity: v === "" || !Number.isFinite(n) ? null : n,
                              });
                            }}
                            aria-label="Quantity"
                          />
                        </TableCell>
                        <TableCell className="tabular text-right text-sm">
                          {r.rate === null ? (
                            <span className="text-muted-foreground">blank</span>
                          ) : (
                            `${r.rate.toLocaleString("en-GB")}${r.currency ? ` ${r.currency}` : ""}`
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={commit.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => commit.mutate()}
            disabled={!load.isSuccess || included.length === 0 || commit.isPending}
          >
            {commit.isPending ? "Adding to the BOQ…" : `Add ${included.length} line(s) to the BOQ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
