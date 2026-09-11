import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ArrowRight, Search } from "lucide-react";
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
import { CURRENCIES, type Currency } from "@/lib/boq";
import { useAuth } from "@/context/AuthContext";
import { EmptyState, LoadingRows } from "@/components/DataState";
import { stageLabel } from "@/components/project/StageMachine";
import { PROJECT_STATUSES, statusLabel, statusVariant } from "@/lib/project-status";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — UZA Build" },
      {
        name: "description",
        content: "Every project, from drawings to an approved Bill of Quantities.",
      },
      { property: "og:title", content: "Projects — UZA Build" },
      {
        property: "og:description",
        content: "Every project, from drawings to an approved Bill of Quantities.",
      },
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    name: "",
    client_id: "",
    location: "",
    currency: "RWF" as Currency,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const term = search.trim().toLowerCase();
  const filtered = projects.filter((p) => {
    const matchesStatus = statusFilter === "all" || (p.status ?? "in_progress") === statusFilter;
    const haystack = [p.project_code, p.name, p.client_name, p.location]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesStatus && (term === "" || haystack.includes(term));
  });

  const create = useMutation({
    mutationFn: async () => {
      const client = clients.find((c) => c.id === form.client_id);
      const { error } = await supabase.from("projects").insert({
        name: form.name,
        client_id: form.client_id || null,
        client_name: client?.name ?? null,
        location: form.location || null,
        currency: form.currency,
        owner_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created.");
      setOpen(false);
      setForm({ name: "", client_id: "", location: "", currency: "RWF" });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            You only see projects you own or are on the team for.
          </p>
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
                <Label htmlFor="np-name">Project name</Label>
                <Input
                  id="np-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-client">Client</Label>
                <Select
                  value={form.client_id}
                  onValueChange={(v) => setForm({ ...form, client_id: v })}
                >
                  <SelectTrigger id="np-client">
                    <SelectValue
                      placeholder={
                        clients.length === 0
                          ? "No client registered yet"
                          : "Select a registered client"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The client record carries the registered name, registration and TIN printed on the
                  proforma.{" "}
                  <Link to="/clients" className="underline">
                    Register a client
                  </Link>{" "}
                  if this one is not listed.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-location">Location</Label>
                <Input
                  id="np-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v as Currency })}
                >
                  <SelectTrigger id="np-currency">
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

              <Button
                className="w-full"
                disabled={!form.name || create.isPending}
                onClick={() => create.mutate()}
              >
                Create project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search by project number, name, client or location"
            aria-label="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <LoadingRows rows={3} />}
      {!isLoading && projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Each project you create or are invited to will appear here with its own project number, client, currency, current stage and status."
        />
      )}
      {!isLoading && projects.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="Nothing matches that search"
          description="Try the project number on its own — for example UZA-P-26-0001 — or clear the status filter."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <p className="tabular text-xs font-medium tracking-wide text-muted-foreground">
                  {p.project_code ?? "—"}
                </p>
                <CardTitle className="mt-1">{p.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[p.client_name, p.location].filter(Boolean).join(" · ") || "No client set"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="secondary">{p.currency}</Badge>
                <Badge variant={statusVariant(p.status)}>{statusLabel(p.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Stage: </span>
                <span className="font-medium">{stageLabel(p.current_stage ?? "intake")}</span>
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                  Open workspace <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
