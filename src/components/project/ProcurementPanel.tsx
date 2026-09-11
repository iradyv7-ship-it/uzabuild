import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, ClipboardList, Send, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState, EmptyState } from "@/components/DataState";
import { formatMoney } from "@/lib/pricing";
import type { CurrencyCode } from "@/config/policy";
import { useAuth } from "@/context/AuthContext";

export function ProcurementPanel({ projectId, currency }: { projectId: string; currency: CurrencyCode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const requisitions = useQuery({
    queryKey: ["requisitions", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requisitions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const rfqs = useQuery({
    queryKey: ["rfqs", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const orders = useQuery({
    queryKey: ["purchase-orders", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deliveries = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addRequisition = useMutation({
    mutationFn: async (v: { reference: string; neededBy: string }) => {
      const { error } = await supabase.from("requisitions").insert({
        project_id: projectId,
        reference: v.reference,
        needed_by: v.neededBy || null,
        status: "draft",
        requested_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Requisition created.");
      void queryClient.invalidateQueries({ queryKey: ["requisitions", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRfq = useMutation({
    mutationFn: async (v: { requisitionId: string; supplierId: string }) => {
      const { error } = await supabase.from("rfqs").insert({
        project_id: projectId,
        requisition_id: v.requisitionId,
        supplier_id: v.supplierId,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("RFQ recorded.");
      void queryClient.invalidateQueries({ queryKey: ["rfqs", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmDelivery = useMutation({
    mutationFn: async (v: { id: string; receiverName: string; note: string }) => {
      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          received_by: user?.id ?? null,
          receiver_name: v.receiverName,
          site_note: v.note || null,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Site delivery confirmed.");
      void queryClient.invalidateQueries({ queryKey: ["deliveries", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reqRows = requisitions.data ?? [];
  const supplierRows = suppliers.data ?? [];
  const rfqRows = rfqs.data ?? [];
  const orderRows = orders.data ?? [];
  const deliveryRows = deliveries.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" aria-hidden /> Requisitions
            </CardTitle>
            <CardDescription>An approved BOQ version becomes the material requisition for site.</CardDescription>
          </div>
          <SimpleDialog
            trigger="New requisition"
            title="New requisition"
            fields={[
              { key: "reference", label: "Reference" },
              { key: "neededBy", label: "Needed by", type: "date" },
            ]}
            onSubmit={(v) => addRequisition.mutate({ reference: v["reference"] ?? "", neededBy: v["neededBy"] ?? "" })}
          />
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={requisitions.isLoading}
            error={requisitions.error}
            isEmpty={reqRows.length === 0}
            onRetry={() => void requisitions.refetch()}
            empty={
              <EmptyState
                title="No requisitions yet"
                description="Material requisitions raised from an approved BOQ version will be listed here with their reference, date needed and status."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Needed by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.reference ?? "Untitled"}</TableCell>
                    <TableCell className="tabular">{r.needed_by ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <SupplierRfqDialog
                        suppliers={supplierRows}
                        onSubmit={(supplierId) => addRfq.mutate({ requisitionId: r.id, supplierId })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" aria-hidden /> Supplier RFQs
          </CardTitle>
          <CardDescription>Quotes requested against a requisition, per supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={rfqs.isLoading}
            error={rfqs.error}
            isEmpty={rfqRows.length === 0}
            onRetry={() => void rfqs.refetch()}
            empty={
              <EmptyState
                title="No quotes requested yet"
                description="Each RFQ sent to a supplier will appear here with the supplier, the date it went out and the quoted lead time once they respond."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfqRows.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                      {supplierRows.find((s) => s.id === q.supplier_id)?.name ?? "Supplier"}
                    </TableCell>
                    <TableCell className="tabular">
                      {q.sent_at ? new Date(q.sent_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {q.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden /> Purchase orders & delivery
          </CardTitle>
          <CardDescription>Orders placed, and confirmation that the material reached site.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <QueryState
            isLoading={orders.isLoading}
            error={orders.error}
            isEmpty={orderRows.length === 0}
            onRetry={() => void orders.refetch()}
            empty={
              <EmptyState
                title="No purchase orders yet"
                description="Once a supplier quote is accepted, the purchase order will be listed here with its number, value and expected delivery date."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.po_number}</TableCell>
                    <TableCell>{supplierRows.find((s) => s.id === o.supplier_id)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(Number(o.total_minor), (o.currency as CurrencyCode) ?? currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <PackageCheck className="size-4" aria-hidden /> Site deliveries
            </h3>
            <QueryState
              isLoading={deliveries.isLoading}
              error={deliveries.error}
              isEmpty={deliveryRows.length === 0}
              onRetry={() => void deliveries.refetch()}
              empty={
                <EmptyState
                  title="No deliveries tracked yet"
                  description="Expected and completed deliveries will show here, each confirmed on site by name with a note from the receiver."
                />
              }
            >
              <div className="space-y-2">
                {deliveryRows.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium capitalize">{d.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.delivered_at
                          ? `Received by ${d.receiver_name ?? "site"} on ${new Date(d.delivered_at).toLocaleDateString()}`
                          : `Expected ${d.expected_at ?? "date not set"}`}
                      </p>
                    </div>
                    {d.status !== "delivered" && (
                      <SimpleDialog
                        trigger="Confirm delivery"
                        title="Confirm site delivery"
                        fields={[
                          { key: "receiverName", label: "Received by (name)" },
                          { key: "note", label: "Site note" },
                        ]}
                        onSubmit={(v) =>
                          confirmDelivery.mutate({
                            id: d.id,
                            receiverName: v["receiverName"] ?? "",
                            note: v["note"] ?? "",
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </QueryState>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SimpleDialog({
  trigger,
  title,
  fields,
  onSubmit,
}: {
  trigger: string;
  title: string;
  fields: { key: string; label: string; type?: string }[];
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const firstKey = fields[0]?.key ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <Button
            className="w-full"
            disabled={!values[firstKey]}
            onClick={() => {
              onSubmit(values);
              setValues({});
              setOpen(false);
            }}
          >
            {trigger}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplierRfqDialog({
  suppliers,
  onSubmit,
}: {
  suppliers: { id: string; name: string }[];
  onSubmit: (supplierId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request quote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a supplier quote</DialogTitle>
        </DialogHeader>
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No suppliers on record yet. Add suppliers in the materials catalog first.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!supplierId}
              onClick={() => {
                onSubmit(supplierId);
                setOpen(false);
              }}
            >
              Record RFQ
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
