import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, FileWarning, FileText, Download, ScanLine, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueryState, EmptyState } from "@/components/DataState";
import { useServerFn } from "@tanstack/react-start";
import { readDrawing } from "@/lib/drawings.functions";
import { useAuth } from "@/context/AuthContext";

/**
 * Formats we can machine-read today. Everything else is accepted, stored, and
 * queued for human takeoff with a written reason — never silently dropped.
 */
const MACHINE_READABLE = ["pdf", "xlsx", "xls", "csv"];
/** Formats the vision reader can look at and measure directly (raster/PDF). */
const VISION_READABLE = ["pdf", "png", "jpg", "jpeg", "webp"];
/**
 * CAD/BIM formats read through the universal drawing reader (readAnyDrawing):
 * native for DXF/IFC/STEP, salvage-mode string extraction for the proprietary
 * binaries. Still routed to human takeoff afterwards — the reader recovers
 * layer/room/schedule labels, it does not replace the QS's confirmed quantity.
 */
const DIGEST_READABLE = ["dxf", "ifc", "step", "stp", "dwg", "rvt", "rfa", "skp", "nwd"];
const ACCEPTED = ".pdf,.dwg,.dxf,.ifc,.step,.stp,.rvt,.rfa,.skp,.nwd,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.doc";

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function takeoffReason(ext: string): string | null {
  if (MACHINE_READABLE.includes(ext)) return null;
  if (DIGEST_READABLE.includes(ext))
    return "Read with the universal drawing reader (layer/room labels salvaged from the file) — a quantity surveyor must still confirm every dimension.";
  if (["png", "jpg", "jpeg", "webp"].includes(ext))
    return "Image drawings carry no scale metadata — read it with the drawing reader, then confirm the dimensions.";
  if (["doc", "docx"].includes(ext))
    return "Written specifications need a human to translate scope into measurable lines.";
  return "This file type has no automated reader — queued for manual takeoff.";
}

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const read = useServerFn(readDrawing);

  const owner = useQuery({
    queryKey: ["project-owner", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data?.owner_id ?? null;
    },
  });

  /**
   * Who may review a raw uploaded file and release it to the client (task 7,
   * case 2): the project owner, china_sourcing, or admin — never the
   * uploader's own automated say-so, and never a client (this whole panel is
   * already hidden from a client seat, but the release action itself is also
   * blocked at the database by a trigger regardless of who can see this UI).
   */
  const canReleaseDocuments =
    Boolean(user?.id) && (user?.id === owner.data || hasRole("china_sourcing") || hasRole("admin"));

  const releaseToClient = useMutation({
    mutationFn: async ({ id, clientVisible }: { id: string; clientVisible: boolean }) => {
      const { error } = await supabase.from("drawings").update({ client_visible: clientVisible }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { clientVisible }) => {
      toast.success(
        clientVisible
          ? "Released to the client. It will now appear in their portal."
          : "Withdrawn from the client's view.",
      );
      void queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not change this document's visibility."),
  });

  const readFile = useMutation({
    mutationFn: async (drawingId: string) => read({ data: { drawingId } }),
    onSuccess: (result) => {
      toast.success(
        `${result.lines} draft line(s) from ${result.spaces} space(s). Every figure is a draft until a surveyor confirms it.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["takeoff-lines", projectId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not read that drawing.");
      void queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
    },
    onSettled: () => setReading(null),
  });

  const drawings = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawings")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {

        const ext = extensionOf(file.name);
        const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
        const { error: storageError } = await supabase.storage.from("drawings").upload(path, file);
        if (storageError) throw storageError;

        const reason = takeoffReason(ext);
        const { error } = await supabase.from("drawings").insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: path,
          file_type: file.type || ext,
          size_bytes: file.size,
          status: reason ? "pending" : "processing",
          requires_human_takeoff: reason !== null,
          human_takeoff_reason: reason,
          document_kind: ["doc", "docx", "xlsx", "xls", "csv"].includes(ext)
            ? "document"
            : "drawing",
          uploaded_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Uploaded. Anything we cannot read is in the human takeoff queue.");
      void queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("drawings").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open that file.");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  const rows = drawings.data ?? [];
  const queued = rows.filter((d) => d.requires_human_takeoff);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Drawings & documents</CardTitle>
          <CardDescription>
            PDF, DWG/DXF, IFC/STEP, RVT, SKP, images, XLSX and DOCX are all accepted. PDFs and images
            are read by the vision model; CAD/BIM files are read by the universal drawing reader
            (native for DXF/IFC/STEP, label salvage for the proprietary binaries). Everything else is
            stored and queued for human takeoff with the reason shown — nothing fails silently.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="sr-only"
            aria-label="Upload drawings and documents"
            onChange={(e) => {
              // Copy the FileList before clearing the input: resetting the
              // value empties the live FileList and the upload would be a no-op.
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) {
                setUploading(true);
                upload.mutate(files);
              }
            }}

          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <FileUp className="size-4" /> {uploading ? "Uploading…" : "Upload files"}
          </Button>

          <QueryState
            isLoading={drawings.isLoading}
            error={drawings.error}
            isEmpty={rows.length === 0}
            onRetry={() => void drawings.refetch()}
            empty={
              <EmptyState
                title="No drawings uploaded yet"
                description="Uploaded architectural and technical files will be listed here with their read status and, where needed, the reason a human must measure them."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Client visibility</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <FileText className="size-4 text-muted-foreground" aria-hidden />
                        {d.file_name}
                      </span>
                      {d.human_takeoff_reason && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {d.human_takeoff_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{d.document_kind}</TableCell>
                    <TableCell>
                      {d.requires_human_takeoff ? (
                        <Badge variant="outline" className="gap-1">
                          <FileWarning className="size-3" aria-hidden /> Human takeoff
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="capitalize">
                          {d.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.client_visible ? (
                        <Badge className="gap-1">
                          <Eye className="size-3" aria-hidden /> Released to client
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <EyeOff className="size-3" aria-hidden /> Internal only
                        </Badge>
                      )}
                      {canReleaseDocuments && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 pl-2 text-xs"
                          disabled={releaseToClient.isPending}
                          onClick={() =>
                            releaseToClient.mutate({ id: d.id, clientVisible: !d.client_visible })
                          }
                        >
                          {d.client_visible ? "Withdraw" : "Review & release"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {d.size_bytes
                        ? `${Math.max(1, Math.round(Number(d.size_bytes) / 1024))} KB`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(VISION_READABLE.includes(extensionOf(d.file_name)) ||
                          DIGEST_READABLE.includes(extensionOf(d.file_name))) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reading !== null}
                            onClick={() => {
                              setReading(d.id);
                              readFile.mutate(d.id);
                            }}
                          >
                            <ScanLine className="size-4" />
                            {reading === d.id
                              ? "Reading…"
                              : d.status === "extracted"
                                ? "Read again"
                                : "Read drawing"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void download(d.storage_path, d.file_name)}
                        >
                          <Download className="size-4" />
                          <span className="sr-only">Download {d.file_name}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>

      {queued.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Human takeoff queue ({queued.length})</CardTitle>
            <CardDescription>
              These files need a quantity surveyor to measure them by hand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queued.map((d) => (
              <div key={d.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{d.file_name}</p>
                <p className="text-muted-foreground">{d.human_takeoff_reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
