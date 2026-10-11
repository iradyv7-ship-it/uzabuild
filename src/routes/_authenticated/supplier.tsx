import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryState, EmptyState } from "@/components/DataState";
import { SupplierThread } from "@/components/supplier/SupplierThread";
import { SupplierQuotes } from "@/components/supplier/SupplierQuotes";
import { categoryLabel, tierLabel } from "@/config/packages";
import { cn } from "@/lib/utils";
import {
  SUPPLIER_STATUS_LABELS,
  downloadFile,
  getSupplierMe,
  listReleasedFiles,
  listSupplierPackages,
  type SupplierPackage,
} from "@/services/supplierService";

export const Route = createFileRoute("/_authenticated/supplier")({
  head: () => ({
    meta: [
      { title: "Supplier workspace · 供应商工作台 — UZA Build" },
      {
        name: "description",
        content: "Requests for quotation from UZA Build, quotations and messages.",
      },
    ],
  }),
  component: SupplierWorkspace,
});

function copy(text: string | null | undefined) {
  if (!text) return;
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copied · 已复制"))
    .catch(() => toast.error("Could not copy · 复制失败"));
}

function date(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "—";
}

/**
 * A factory's whole view of UZA: the requests for quotation it was sent, the
 * files UZA released for them, its own quotations and its own thread with UZA.
 * Every list here comes from the database already walled to this factory —
 * nothing about the client, the project, the budget or another factory exists
 * on this page to hide.
 */
function SupplierWorkspace() {
  const me = useQuery({ queryKey: ["supplier-me"], queryFn: getSupplierMe });
  const packages = useQuery({ queryKey: ["supplier-packages"], queryFn: listSupplierPackages });
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => packages.data ?? [], [packages.data]);
  useEffect(() => {
    if (!selected && rows.length > 0) setSelected(rows[0]!.package_id);
  }, [rows, selected]);
  const active = rows.find((p) => p.package_id === selected) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Supplier workspace · 供应商工作台
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {me.data?.supplier_name ?? (me.isLoading ? "…" : "Your company · 贵公司")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Requests for quotation from UZA Build, your quotations and your messages with UZA — all in
          one place. · 来自 UZA Build 的询价单、您的报价以及与 UZA 的沟通，均在此处。
        </p>
      </header>

      {!me.isLoading && !me.data && (
        <Card>
          <CardContent className="py-6 text-sm">
            This account is not linked to a supplier yet. Please contact your UZA sourcing contact.
            · 此账号尚未关联供应商，请联系 UZA 采购联系人。
          </CardContent>
        </Card>
      )}

      <QueryState
        isLoading={packages.isLoading}
        error={packages.error}
        isEmpty={rows.length === 0}
        onRetry={() => void packages.refetch()}
        empty={
          <EmptyState
            title="No requests for quotation yet · 暂无询价单"
            description="When UZA sends you a request for quotation, it appears here with its specification, quantities and files. · UZA 向您发送询价单后，规格、数量和相关文件将显示在这里。"
          />
        }
      >
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Requests for quotation · 询价单" className="space-y-2">
            {rows.map((p) => (
              <button
                key={p.package_id}
                type="button"
                onClick={() => setSelected(p.package_id)}
                className={cn(
                  "w-full rounded-md border p-3 text-left transition-colors hover:bg-muted",
                  p.package_id === selected && "border-primary bg-primary/5",
                )}
              >
                <p className="font-medium tabular">{p.rfq_reference || p.package_code || "RFQ"}</p>
                <p className="text-sm text-muted-foreground">{categoryLabel(p.category)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge variant={p.shortlist_status === "open" ? "outline" : "secondary"}>
                    {SUPPLIER_STATUS_LABELS[p.shortlist_status] ?? p.shortlist_status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Sent · 发送于 {date(p.rfq_sent_at)}
                  </span>
                </div>
              </button>
            ))}
          </nav>

          {active && me.data && <PackageView pkg={active} supplierId={me.data.supplier_id} />}
        </div>
      </QueryState>
    </div>
  );
}

function PackageView({ pkg, supplierId }: { pkg: SupplierPackage; supplierId: string }) {
  const files = useQuery({
    queryKey: ["supplier-files", pkg.package_id],
    queryFn: () => listReleasedFiles(pkg.package_id),
  });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="tabular">{pkg.rfq_reference || pkg.package_code}</span>
          <span className="text-muted-foreground">· {categoryLabel(pkg.category)}</span>
        </CardTitle>
        <CardDescription className="tabular">
          Quality tier · 品质等级: {tierLabel(pkg.quality_tier)} · Required delivery · 要求交货:{" "}
          {date(pkg.required_delivery_date)} · Status · 状态:{" "}
          {SUPPLIER_STATUS_LABELS[pkg.shortlist_status] ?? pkg.shortlist_status}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rfq" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="rfq">Request · 询价</TabsTrigger>
            <TabsTrigger value="files">Files · 文件 ({files.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="quote">Your quotation · 您的报价</TabsTrigger>
            <TabsTrigger value="messages">Messages · 消息</TabsTrigger>
          </TabsList>

          <TabsContent value="rfq" className="space-y-3">
            <p className="text-xs text-muted-foreground">Sent · 发送于 {date(pkg.rfq_sent_at)}</p>
            <div className="grid gap-4 xl:grid-cols-2">
              <RfqText title="中文" text={pkg.rfq_chinese} />
              <RfqText title="English" text={pkg.rfq_english} />
            </div>
          </TabsContent>

          <TabsContent value="files">
            <QueryState
              isLoading={files.isLoading}
              error={files.error}
              isEmpty={(files.data?.length ?? 0) === 0}
              onRetry={() => void files.refetch()}
              empty={
                <EmptyState
                  title="No files released yet · 暂无文件"
                  description="Drawings and specifications UZA releases for this request appear here. · UZA 发布的图纸和规格将显示在这里。"
                />
              }
            >
              <ul className="space-y-2">
                {(files.data ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.file_name}</span>
                        <span className="block text-xs capitalize text-muted-foreground">
                          {f.kind}
                          {f.caption ? ` · ${f.caption}` : ""}
                        </span>
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void downloadFile(f.storage_path, f.file_name).catch((e: unknown) =>
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Could not open that file · 无法打开该文件",
                          ),
                        )
                      }
                    >
                      <Download className="size-4" aria-hidden /> Download · 下载
                    </Button>
                  </li>
                ))}
              </ul>
            </QueryState>
          </TabsContent>

          <TabsContent value="quote">
            <SupplierQuotes
              packageId={pkg.package_id}
              projectId={pkg.project_id}
              supplierId={supplierId}
              open={pkg.shortlist_status === "open"}
            />
          </TabsContent>

          <TabsContent value="messages">
            <SupplierThread packageId={pkg.package_id} supplierId={supplierId} side="factory" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RfqText({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button variant="ghost" size="sm" disabled={!text} onClick={() => copy(text)}>
          <Copy className="size-4" aria-hidden /> Copy · 复制
        </Button>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-sans text-sm leading-relaxed">
        {text || "—"}
      </pre>
    </div>
  );
}
