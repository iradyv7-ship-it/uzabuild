import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ProformaDocument } from "@/components/project/ProformaDocument";
import { getProformaClient, listProformaLines } from "@/services/portalService";

/** Opens one issued proforma on the UZA letterhead, ready to print or save. */
export function ProformaViewerDialog({
  proformaId,
  header,
  projectName,
}: {
  proformaId: string;
  header: React.ComponentProps<typeof ProformaDocument>["proforma"] & { client_id: string | null };
  projectName: string;
}) {
  const lines = useQuery({
    queryKey: ["portal-proforma-lines", proformaId],
    queryFn: () => listProformaLines(proformaId),
  });

  const client = useQuery({
    queryKey: ["portal-proforma-client", header.client_id],
    enabled: Boolean(header.client_id),
    queryFn: () => getProformaClient(header.client_id ?? ""),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText className="mr-1 size-4" aria-hidden /> Open document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="print-hidden flex-row items-center justify-between gap-3 space-y-0 border-b border-border p-4">
          <DialogTitle>{header.reference}</DialogTitle>
          <Button size="sm" onClick={() => window.print()}>
            Print / save as PDF
          </Button>
        </DialogHeader>
        <ProformaDocument
          proforma={header}
          client={client.data ?? null}
          lines={lines.data ?? []}
          projectName={projectName}
        />
      </DialogContent>
    </Dialog>
  );
}
