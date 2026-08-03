import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, type Currency } from "@/lib/boq";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — UZA Build" },
      { name: "description", content: "Every project, from drawings to an approved Bill of Quantities." },
      { property: "og:title", content: "Projects — UZA Build" },
      { property: "og:description", content: "Every project, from drawings to an approved Bill of Quantities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", location: "", currency: "RWF" as Currency });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").insert({
        name: form.name,
        client_name: form.client_name || null,
        location: form.location || null,
        currency: form.currency,
        owner_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created.");
      setOpen(false);
      setForm({ name: "", client_name: "", location: "", currency: "RWF" });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-1 text-muted-foreground">You only see projects you own or are on the team for.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> New project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                  <SelectTrigger>
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
              <Button className="w-full" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
                Create project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && projects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No projects yet. Create the first one to start a takeoff.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{p.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[p.client_name, p.location].filter(Boolean).join(" · ") || "No client set"}
                </p>
              </div>
              <Badge variant="secondary">{p.currency}</Badge>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                  Open BOQ <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
