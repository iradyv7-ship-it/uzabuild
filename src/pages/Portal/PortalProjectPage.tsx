import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, EmptyState } from "@/components/DataState";
import { StageTimeline } from "@/components/portal/StageTimeline";
import { ProformaViewerDialog } from "@/components/portal/ProformaViewerDialog";
import { RenderingPanel } from "@/components/project/RenderingPanel";
import {
  getDocumentDownloadUrl,
  getPortalProject,
  listClientVisibleDocuments,
  listProjectApprovals,
  listProjectProformas,
} from "@/services/portalService";

/**
 * The client's own view of their project.
 *
 * It deliberately carries no cost build-up, no catalog rate, no supplier and no
 * margin — only the stage the work has reached, who signed what, and the
 * agreed price on a proforma UZA has actually issued.
 */
export function PortalProjectPage({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ["portal-project", projectId],
    queryFn: () => getPortalProject(projectId),
  });

  const approvals = useQuery({
    queryKey: ["portal-approvals", projectId],
    queryFn: () => listProjectApprovals(projectId),
  });

  const proformas = useQuery({
    queryKey: ["portal-proformas", projectId],
    queryFn: () => listProjectProformas(projectId),
  });

  const documents = useQuery({
    queryKey: ["portal-documents", projectId],
    queryFn: () => listClientVisibleDocuments(projectId),
  });

  async function download(storagePath: string, name: string) {
    try {
      const url = await getDocumentDownloadUrl(storagePath);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that file.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/portal">
            <ArrowLeft className="size-4" aria-hidden /> All your projects
          </Link>
        </Button>
      </div>

      <QueryState
        isLoading={project.isLoading}
        error={project.error}
        isEmpty={!project.data}
        onRetry={() => void project.refetch()}
        empty={
          <EmptyState
            title="This project is not shared with you"
            description="Ask your UZA contact to add you to the project and it will appear here."
          />
        }
      >
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{project.data?.name}</h1>
          <p className="text-muted-foreground">
            {[project.data?.client_name, project.data?.location].filter(Boolean).join(" · ")}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where the work stands</CardTitle>
            <CardDescription>
              Each stage is signed by the specialist responsible for it before the next one starts.
              Nothing is marked complete on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StageTimeline
              currentStage={project.data?.current_stage}
              signoffs={approvals.data ?? []}
            />
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Your rendering</h2>
          <RenderingPanel projectId={projectId} canManage={false} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents shared with you</CardTitle>
            <CardDescription>
              Only files UZA has reviewed and released to you appear here — nothing is shared
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={documents.isLoading}
              error={documents.error}
              isEmpty={(documents.data?.length ?? 0) === 0}
              onRetry={() => void documents.refetch()}
              empty={
                <EmptyState
                  title="Nothing shared yet"
                  description="When UZA releases a drawing or document to you, it will appear here."
                />
              }
            >
              <ul className="space-y-2">
                {(documents.data ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 text-muted-foreground" aria-hidden />
                      {d.file_name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void download(d.storage_path, d.file_name)}
                    >
                      <Download className="size-4" aria-hidden /> Download
                    </Button>
                  </li>
                ))}
              </ul>
            </QueryState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proformas issued to you</CardTitle>
            <CardDescription>
              Only documents UZA has formally issued appear here, at the agreed price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={proformas.isLoading}
              error={proformas.error}
              isEmpty={(proformas.data?.length ?? 0) === 0}
              onRetry={() => void proformas.refetch()}
              empty={
                <EmptyState
                  title="No proforma issued yet"
                  description="When UZA issues a proforma for this project you will be able to open and print it here."
                />
              }
            >
              <ul className="space-y-2">
                {(proformas.data ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <div className="tabular flex items-center gap-2 font-medium">
                        {p.reference}
                        <Badge variant={p.signed_by_name ? "default" : "secondary"}>
                          {p.signed_by_name ? "Signed" : "Issued"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {p.title}
                        {p.issued_at
                          ? ` · issued ${new Date(p.issued_at).toLocaleDateString("en-GB")}`
                          : ""}
                        {p.signed_by_name
                          ? ` · signed by ${p.signed_by_name}${p.signed_by_title ? `, ${p.signed_by_title}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <ProformaViewerDialog
                      proformaId={p.id}
                      header={p}
                      projectName={project.data?.name ?? ""}
                    />
                  </li>
                ))}
              </ul>
            </QueryState>
          </CardContent>
        </Card>
      </QueryState>
    </div>
  );
}
