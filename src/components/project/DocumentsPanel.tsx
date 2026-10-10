import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileUp,
  FileWarning,
  FileText,
  Download,
  ScanLine,
  Eye,
  EyeOff,
  Lock,
  Inbox,
  Sheet,
} from "lucide-react";
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
import { reviewStatusLabel } from "@/services/clientWorkspaceService";
import { DocumentWorkDialog, type WorkDocument } from "@/components/project/DocumentWorkDialog";
import { DisciplineAssistant } from "@/components/project/DisciplineAssistant";
import { BoqImportDialog } from "@/components/project/BoqImportDialog";

/** Formats the vision reader looks at and measures directly. */
const VISION_READABLE = ["pdf", "png", "jpg", "jpeg", "webp", "gif"];
/**
 * CAD/BIM formats read through the universal drawing reader: parsed for
 * DXF/IFC/STEP, label salvage for the proprietary binaries. Always confirmed
 * by a QS afterwards — the reader recovers labels, not measured quantities.
 */
const DIGEST_READABLE = ["dxf", "ifc", "step", "stp", "dwg", "rvt", "rfa", "skp", "nwd"];
/** Word and PowerPoint: their text (specifications, schedules) is extracted and read. */
const TEXT_READABLE = ["docx", "pptx"];
/** Spreadsheets are imported into the BOQ, not read as drawings. */
const SPREADSHEETS = ["xlsx", "xlsm", "xls", "ods", "csv", "tsv"];
/** Accepted and stored, but must be converted before anything can read them. */
const NOT_READABLE = ["heic", "heif", "tif", "tiff", "bmp", "doc", "ppt"];
const ACCEPTED = [
  ...VISION_READABLE,
  ...DIGEST_READABLE,
  ...TEXT_READABLE,
  ...SPREADSHEETS,
  ...NOT_READABLE,
]
  .map((e) => `.${e}`)
  .join(",");

/** The automatic reader's limit — larger files are stored but must be split to be read. */
const MAX_READ_BYTES = 18 * 1024 * 1024;
/** The vision model rejects images above about 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function takeoffReason(ext: string, size: number): string | null {
  if (size > MAX_READ_BYTES)
    return "Larger than the 18 MB automatic-reader limit — split it into smaller files to read it, or measure by hand.";
  if (SPREADSHEETS.includes(ext)) return null;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) && size > MAX_IMAGE_BYTES)
    return "Image over 5 MB — the reader cannot take it. Upload a smaller photo or the drawing as a PDF, or measure by hand.";
  if (ext === "pdf") return null;
  if (DIGEST_READABLE.includes(ext))
    return "Read with the universal drawing reader (layer/room labels salvaged from the file) — a quantity surveyor must still confirm every dimension.";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
    return "Image drawings carry no scale metadata — read it with the drawing reader, then confirm the dimensions.";
  if (TEXT_READABLE.includes(ext))
    return "Written specifications and schedules: read it to draft lines, then a QS turns scope into measurable quantities.";
  if (["heic", "heif", "tif", "tiff", "bmp"].includes(ext))
    return `${ext.toUpperCase()} images cannot be read automatically — export as PDF or JPG and upload that, or measure by hand.`;
  if (["doc", "ppt"].includes(ext))
    return `Old .${ext} files cannot be read automatically — save as .${ext}x or PDF and upload that.`;
  return "This file type has no automated reader — queued for manual takeoff.";
}

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkDocument | null>(null);
  const [importing, setImporting] = useState<{ id: string; file_name: string } | null>(null);
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

  /**
   * Who routes a restricted document to discipline seats. Mirrors
   * is_project_lead() in 20261009120000 (owner, project manager, admin) —
   * the database is what actually enforces it.
   */
  const isLead =
    Boolean(user?.id) &&
    (user?.id === owner.data || hasRole("project_manager") || hasRole("admin"));

  const releaseToClient = useMutation({
    mutationFn: async ({ id, clientVisible }: { id: string; clientVisible: boolean }) => {
      const { error } = await supabase
        .from("drawings")
        .update({ client_visible: clientVisible })
        .eq("id", id);
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

        const reason = takeoffReason(ext, file.size);
        const { error } = await supabase.from("drawings").insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: path,
          file_type: file.type || ext,
          size_bytes: file.size,
          // Nothing is "processing" until a read actually starts.
          status: "pending",
          requires_human_takeoff: reason !== null,
          human_takeoff_reason: reason,
          document_kind: [...SPREADSHEETS, "doc", "docx", "ppt", "pptx"].includes(ext)
            ? "document"
            : "drawing",
          uploaded_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        "Uploaded. Read drawings and documents with “Read”, bring spreadsheets in with “Import as BOQ” — anything that cannot be read is in the human takeoff queue with the reason.",
      );
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
  const awaitingRouting = rows.filter(
    (d) => d.submitted_by_client && d.review_status === "received",
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Drawings & documents</CardTitle>
          <CardDescription>
            PDFs and images (up to 5 MB) are read by the vision model. CAD/BIM files go through the
            universal drawing reader (parsed for DXF/IFC/STEP, label salvage for DWG, RVT, SKP).
            Word and PowerPoint text is extracted and read. Excel, CSV and ODS spreadsheets — an
            existing BOQ, a schedule, a price list — are imported straight into the BOQ. HEIC/TIFF
            photos and old .doc files are stored but must be converted first. The reader takes files
            up to 18 MB; every file it cannot read sits in the human takeoff queue with the reason.
            Client submissions are restricted: you see the ones a project lead has granted to your
            seat or to you.
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
              const tooLarge = files.filter((f) => f.size > MAX_READ_BYTES);
              if (tooLarge.length > 0) {
                toast.warning(
                  `${tooLarge.map((f) => f.name).join(", ")} ${tooLarge.length === 1 ? "is" : "are"} over 18 MB — stored, but the automatic reader cannot read ${tooLarge.length === 1 ? "it" : "them"}. Split into smaller files to have them read.`,
                );
              }
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
                      {(d.submitted_by_client || d.access_restricted) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {d.submitted_by_client && (
                            <Badge variant="outline" className="gap-1">
                              <Inbox className="size-3" aria-hidden /> From client ·{" "}
                              {reviewStatusLabel(d.review_status)}
                            </Badge>
                          )}
                          {d.access_restricted && (
                            <Badge variant="outline" className="gap-1">
                              <Lock className="size-3" aria-hidden /> Restricted
                            </Badge>
                          )}
                        </span>
                      )}
                      {d.client_note && <p className="mt-1 text-xs">Client: “{d.client_note}”</p>}
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
                        <Button variant="outline" size="sm" onClick={() => setWorking(d)}>
                          Access & progress
                        </Button>
                        {SPREADSHEETS.includes(extensionOf(d.file_name)) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setImporting({ id: d.id, file_name: d.file_name })}
                          >
                            <Sheet className="size-4" />
                            Import as BOQ
                          </Button>
                        )}
                        {(VISION_READABLE.includes(extensionOf(d.file_name)) ||
                          DIGEST_READABLE.includes(extensionOf(d.file_name)) ||
                          TEXT_READABLE.includes(extensionOf(d.file_name))) &&
                          Number(d.size_bytes ?? 0) <= MAX_READ_BYTES && (
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

      {awaitingRouting.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">
              New from the client ({awaitingRouting.length})
            </CardTitle>
            <CardDescription>
              {isLead
                ? "Restricted until you route them: open each one, grant the seats that need it (architect, QS, interior designer, MEP), then set its status — the client sees the status and every update you mark as visible."
                : "Waiting for a project lead to route these to the right specialists."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {awaitingRouting.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <span className="font-medium">{d.file_name}</span>
                <Button size="sm" onClick={() => setWorking(d)}>
                  Route & review
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <DisciplineAssistant projectId={projectId} />

      {importing && (
        <BoqImportDialog
          projectId={projectId}
          drawing={importing}
          onClose={() => setImporting(null)}
        />
      )}

      {working && (
        <DocumentWorkDialog
          projectId={projectId}
          doc={rows.find((r) => r.id === working.id) ?? working}
          isLead={isLead}
          onClose={() => setWorking(null)}
        />
      )}

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
