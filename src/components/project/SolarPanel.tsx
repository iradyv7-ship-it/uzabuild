import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, EmptyState } from "@/components/DataState";
import {
  SOLAR_BATTERY_AUTONOMY_DAYS,
  SOLAR_DEPTH_OF_DISCHARGE_PCT,
  SOLAR_PEAK_SUN_HOURS,
  SOLAR_SHARE_OPTIONS_PCT,
  SOLAR_SYSTEM_LOSSES_PCT,
} from "@/config/policy";
import { formatQuantity } from "@/lib/pricing";

/** Pure sizing maths — no money literals, all assumptions come from policy.ts. */
export function sizeSolar(dailyLoadKwh: number, peakLoadKw: number, solarSharePct: number) {
  const solarKwh = (dailyLoadKwh * solarSharePct) / 100;
  const arrayKwp = solarKwh / (SOLAR_PEAK_SUN_HOURS * (1 - SOLAR_SYSTEM_LOSSES_PCT / 100));
  const batteryKwh = (solarKwh * SOLAR_BATTERY_AUTONOMY_DAYS) / (SOLAR_DEPTH_OF_DISCHARGE_PCT / 100);
  return {
    arrayKwp: Number(arrayKwp.toFixed(2)),
    batteryKwh: Number(batteryKwh.toFixed(2)),
    inverterKw: Number(peakLoadKw.toFixed(2)),
  };
}

export function SolarPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [dailyLoad, setDailyLoad] = useState("");
  const [peakLoad, setPeakLoad] = useState("");

  const proposals = useQuery({
    queryKey: ["solar-proposals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solar_proposals")
        .select("*")
        .eq("project_id", projectId)
        .order("solar_share_pct");
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const daily = Number(dailyLoad);
      const peak = Number(peakLoad);
      if (!Number.isFinite(daily) || daily <= 0) throw new Error("Enter the daily load in kWh.");
      if (!Number.isFinite(peak) || peak <= 0) throw new Error("Enter the peak load in kW.");

      await supabase.from("solar_proposals").delete().eq("project_id", projectId);
      const rows = SOLAR_SHARE_OPTIONS_PCT.map((share) => {
        const sized = sizeSolar(daily, peak, share);
        return {
          project_id: projectId,
          solar_share_pct: share,
          grid_share_pct: 100 - share,
          daily_load_kwh: daily,
          peak_load_kw: peak,
          array_kwp: sized.arrayKwp,
          battery_kwh: sized.batteryKwh,
          inverter_kw: sized.inverterKw,
          is_selected: false,
        };
      });
      const { error } = await supabase.from("solar_proposals").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solar mix options generated.");
      void queryClient.invalidateQueries({ queryKey: ["solar-proposals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const select = useMutation({
    mutationFn: async (id: string) => {
      const { error: clearErr } = await supabase
        .from("solar_proposals")
        .update({ is_selected: false })
        .eq("project_id", projectId);
      if (clearErr) throw clearErr;
      const { error } = await supabase.from("solar_proposals").update({ is_selected: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["solar-proposals", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = proposals.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="size-5 text-primary" aria-hidden /> Solar / grid mix options
        </CardTitle>
        <CardDescription>
          Sized from the project load using the Kigali assumptions held in policy configuration
          ({SOLAR_PEAK_SUN_HOURS} peak sun hours, {SOLAR_SYSTEM_LOSSES_PCT}% losses). Equipment cost is priced from the
          materials catalog in the BOQ — these options carry the sizing, not an invented price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="daily">Daily load (kWh)</Label>
            <Input id="daily" inputMode="decimal" value={dailyLoad} onChange={(e) => setDailyLoad(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="peak">Peak load (kW)</Label>
            <Input id="peak" inputMode="decimal" value={peakLoad} onChange={(e) => setPeakLoad(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => generate.mutate()} disabled={generate.isPending}>
              Generate options
            </Button>
          </div>
        </div>

        <QueryState
          isLoading={proposals.isLoading}
          error={proposals.error}
          isEmpty={rows.length === 0}
          onRetry={() => void proposals.refetch()}
          empty={
            <EmptyState
              title="No solar options yet"
              description="Enter the project load above and every grid/solar mix from 80/20 through 20/80 will appear here with its array, battery and inverter sizing, ready to select."
            />
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${p.is_selected ? "border-primary ring-1 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {p.grid_share_pct}/{p.solar_share_pct} grid/solar
                  </p>
                  {p.is_selected && <Badge>Selected</Badge>}
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Array</dt>
                    <dd className="tabular">{formatQuantity(Number(p.array_kwp))} kWp</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Battery</dt>
                    <dd className="tabular">{formatQuantity(Number(p.battery_kwh))} kWh</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Inverter</dt>
                    <dd className="tabular">{formatQuantity(Number(p.inverter_kw))} kW</dd>
                  </div>
                </dl>
                <Button
                  variant={p.is_selected ? "secondary" : "outline"}
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => select.mutate(p.id)}
                >
                  {p.is_selected ? "Selected option" : "Select this mix"}
                </Button>
              </div>
            ))}
          </div>
        </QueryState>
      </CardContent>
    </Card>
  );
}
