import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryState, EmptyState } from "@/components/DataState";
import { ClientWizard, type ClientDraft } from "@/components/clients/ClientWizard";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — UZA Build" },
      {
        name: "description",
        content: "Registered client entities, with the legal identity every UZA proforma and invoice is drawn from.",
      },
      { property: "og:title", content: "Clients — UZA Build" },
      {
        property: "og:description",
        content: "Registered client entities, with the legal identity every UZA proforma and invoice is drawn from.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Clients</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            One registered record per client entity. It is what the UZA Solutions letterhead, the proforma header and
            the invoice are drawn from, so it is filled in step by step rather than guessed at.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Register client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register a client</DialogTitle>
              <DialogDescription>
                Four short steps: legal identity, contact and address, decision path, working notes.
              </DialogDescription>
            </DialogHeader>
            <ClientWizard onDone={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <QueryState
        isLoading={clients.isLoading}
        error={clients.error}
        isEmpty={(clients.data?.length ?? 0) === 0}
        onRetry={() => void clients.refetch()}
        empty={
          <EmptyState
            title="No client registered yet"
            description="Each client you register will appear here with its registered name, registration and TIN, its final approver and the projects it owns."
          />
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(clients.data ?? []).map((c) => {
            const complete = Boolean(c.name && c.country && c.decision_maker_name && (c.email || c.phone));
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="size-4 text-muted-foreground" aria-hidden />
                      {c.name}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[c.city, c.country].filter(Boolean).join(", ")}
                      {c.sector ? ` · ${c.sector}` : ""}
                    </p>
                  </div>
                  <Badge variant={complete ? "secondary" : "outline"}>
                    {complete ? "Ready for a proforma" : "Incomplete"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Registration: <span className="tabular text-foreground">{c.company_registration || "—"}</span> · TIN:{" "}
                    <span className="tabular text-foreground">{c.tin || "—"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Final approver:{" "}
                    <span className="text-foreground">
                      {c.decision_maker_name || "Not recorded"}
                      {c.decision_maker_role ? ` · ${c.decision_maker_role}` : ""}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Documents to: <span className="text-foreground">{c.billing_email || c.email || c.phone || "—"}</span>
                  </p>
                  <Dialog open={editing === c.id} onOpenChange={(o) => setEditing(o ? c.id : null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Pencil className="size-4" /> Edit record
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{c.name}</DialogTitle>
                        <DialogDescription>Changes here change every proforma issued from now on.</DialogDescription>
                      </DialogHeader>
                      <ClientWizard
                        clientId={c.id}
                        initial={
                          {
                            name: c.name ?? "",
                            company_registration: c.company_registration ?? "",
                            tin: c.tin ?? "",
                            sector: c.sector ?? "",
                            contact_name: c.contact_name ?? "",
                            email: c.email ?? "",
                            phone: c.phone ?? "",
                            address: c.address ?? "",
                            city: c.city ?? "",
                            country: c.country ?? "Rwanda",
                            billing_email: c.billing_email ?? "",
                            decision_maker_name: c.decision_maker_name ?? "",
                            decision_maker_role: c.decision_maker_role ?? "",
                            decision_maker_phone: c.decision_maker_phone ?? "",
                            preferred_language: c.preferred_language ?? "en",
                            source_note: c.source_note ?? "",
                            notes: c.notes ?? "",
                          } satisfies ClientDraft
                        }
                        onDone={() => setEditing(null)}
                      />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </QueryState>
    </div>
  );
}
