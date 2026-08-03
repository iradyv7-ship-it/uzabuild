import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Business Settings — UZA Build" },
      { name: "description", content: "Default wastage rates and solar sizing assumptions used across every estimate." },
      { property: "og:title", content: "Business Settings — UZA Build" },
      { property: "og:description", content: "Default wastage rates and solar sizing assumptions used across every estimate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const FIELDS = [
  { key: "default_wastage_tiles_pct", label: "Wastage — tiles (%)" },
  { key: "default_wastage_paint_pct", label: "Wastage — paint (%)" },
  { key: "default_wastage_masonry_pct", label: "Wastage — masonry (%)" },
  { key: "solar_peak_sun_hours", label: "Solar — peak sun hours / day" },
  { key: "solar_system_losses_pct", label: "Solar — system losses (%)" },
  { key: "solar_battery_autonomy_days", label: "Solar — battery autonomy (days)" },
  { key: "solar_depth_of_discharge_pct", label: "Solar — depth of discharge (%)" },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: settings = [] } = useQuery({
    queryKey: ["business-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings.length) {
      setValues(Object.fromEntries(settings.map((s) => [s.key, String(s.value)])));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      for (const f of FIELDS) {
        const value = Number(values[f.key] ?? 0);
        const { error } = await supabase
          .from("business_settings")
          .upsert({ key: f.key, value, label: f.label }, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Settings saved. New estimates use these defaults.");
      void queryClient.invalidateQueries({ queryKey: ["business-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Business Settings</h1>
        <p className="mt-1 text-muted-foreground">
          House defaults, not hard rules — any line can override them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label>{f.label}</Label>
              <Input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
