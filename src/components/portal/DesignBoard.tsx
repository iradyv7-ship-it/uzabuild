import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Box, ImageIcon, Lightbulb, Palette, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { QueryState, EmptyState } from "@/components/DataState";
import { useAuth } from "@/context/AuthContext";
import {
  SELECTION_KIND_LABELS,
  SELECTION_KINDS,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUSES,
  createSelection,
  deleteSelection,
  listProjectRooms,
  listSelections,
  listShowcaseItems,
  openFile,
  respondToSelection,
  selectionStatusLabel,
  type ClientSelection,
  type SelectionKind,
  type SelectionStatus,
  type ShowcaseItem,
} from "@/services/clientWorkspaceService";

const NONE = "__none__";

/** Only ever link out to an http(s) URL — a catalog field is not trusted markup. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "customised") return "secondary";
  if (status === "declined") return "destructive";
  return "outline";
}

function KindIcon({ kind }: { kind: string }) {
  if (kind === "colour") return <Palette className="size-4" aria-hidden />;
  if (kind === "reference") return <ImageIcon className="size-4" aria-hidden />;
  if (kind === "idea") return <Lightbulb className="size-4" aria-hidden />;
  return <Box className="size-4" aria-hidden />;
}

function ProductCard({
  item,
  onPropose,
}: {
  item: ShowcaseItem;
  onPropose?: ((item: ShowcaseItem) => void) | undefined;
}) {
  const image = safeUrl(item.image_url);
  const model = safeUrl(item.model_url);
  return (
    <div className="flex flex-col overflow-hidden rounded-md border">
      <div
        className="flex aspect-[4/3] items-center justify-center bg-muted"
        style={!image && item.swatch_hex ? { backgroundColor: item.swatch_hex } : undefined}
      >
        {image ? (
          <img src={image} alt={item.name} loading="lazy" className="size-full object-cover" />
        ) : (
          !item.swatch_hex && <Box className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.category}</p>
          <p className="font-medium">{item.name}</p>
          {item.description && (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {item.swatch_hex && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className="inline-block size-4 rounded-sm border"
                style={{ backgroundColor: item.swatch_hex }}
                aria-hidden
              />
              {item.swatch_hex}
            </span>
          )}
          {model && (
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <a href={model} target="_blank" rel="noopener noreferrer">
                View in 3D
              </a>
            </Button>
          )}
          {onPropose && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => onPropose(item)}>
              <Plus className="size-4" aria-hidden /> Propose
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type Draft = {
  kind: SelectionKind;
  title: string;
  roomId: string;
  areaLabel: string;
  catalogItemId: string;
  colourHex: string;
  notes: string;
  attachment: File | null;
};

const EMPTY_DRAFT: Draft = {
  kind: "product",
  title: "",
  roomId: NONE,
  areaLabel: "",
  catalogItemId: NONE,
  colourHex: "#d9cbb5",
  notes: "",
  attachment: null,
};

/**
 * The client's design board. A client studies their project, browses the
 * products UZA shows them (tiles, sanitary, lighting, finishes, with pictures
 * and 3D links), and proposes what they want — a product, a colour, a
 * reference picture or an idea — per room. The team answers each proposal:
 * accepted, customised with an alternative, or not possible and why.
 *
 * `mode="team"` is the same board from the design team's side, with the
 * answer controls instead of the propose controls.
 */
export function DesignBoard({ projectId, mode }: { projectId: string; mode: "client" | "team" }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answering, setAnswering] = useState<ClientSelection | null>(null);
  const [category, setCategory] = useState<string>("all");

  const selectionsKey = ["client-selections", projectId] as const;
  const showcase = useQuery({ queryKey: ["showcase-items"], queryFn: listShowcaseItems });
  const rooms = useQuery({
    queryKey: ["project-rooms", projectId],
    queryFn: () => listProjectRooms(projectId),
  });
  const selections = useQuery({
    queryKey: selectionsKey,
    queryFn: () => listSelections(projectId),
  });

  const items = useMemo(() => showcase.data ?? [], [showcase.data]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const visibleItems = category === "all" ? items : items.filter((i) => i.category === category);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const roomById = useMemo(() => new Map((rooms.data ?? []).map((r) => [r.id, r])), [rooms.data]);

  const create = useMutation({
    mutationFn: (d: Draft) =>
      createSelection({
        projectId,
        kind: d.kind,
        title: d.title,
        roomId: d.roomId === NONE ? null : d.roomId,
        areaLabel: d.areaLabel,
        catalogItemId: d.kind === "product" && d.catalogItemId !== NONE ? d.catalogItemId : null,
        colourHex: d.kind === "colour" ? d.colourHex : null,
        notes: d.notes,
        attachment: d.attachment,
      }),
    onSuccess: () => {
      toast.success("Proposal added. The design team will answer it here.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: selectionsKey });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not add that proposal."),
  });

  const remove = useMutation({
    mutationFn: deleteSelection,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: selectionsKey }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove that."),
  });

  function proposeProduct(item: ShowcaseItem) {
    setDraft({ ...EMPTY_DRAFT, kind: "product", title: item.name, catalogItemId: item.id });
  }

  const rows = selections.data ?? [];
  const openCount = rows.filter((r) => r.status === "proposed" || r.status === "in_review").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">
            {mode === "client" ? "Your design board" : "Client design board"}
          </CardTitle>
          <CardDescription>
            {mode === "client"
              ? "Choose finishes for each room — tiles, colours, fittings, or a picture of something you like. The design team answers every proposal and tells you what they changed."
              : `What the client is asking for, room by room. ${openCount} waiting for an answer.`}
          </CardDescription>
        </div>
        {mode === "client" && (
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus className="size-4" aria-hidden /> New proposal
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="proposals" className="space-y-4">
          <TabsList>
            <TabsTrigger value="proposals">Proposals ({rows.length})</TabsTrigger>
            <TabsTrigger value="products">Products ({items.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="proposals">
            <QueryState
              isLoading={selections.isLoading}
              error={selections.error}
              isEmpty={rows.length === 0}
              onRetry={() => void selections.refetch()}
              empty={
                <EmptyState
                  title="No proposals yet"
                  description={
                    mode === "client"
                      ? "Add a product, colour, reference picture or idea and the design team will answer it here."
                      : "When the client proposes a product, colour or reference, it will appear here for you to answer."
                  }
                />
              }
            >
              <ul className="space-y-3">
                {rows.map((s) => {
                  const product = s.catalog_item_id ? itemById.get(s.catalog_item_id) : undefined;
                  const alternative = s.alternative_item_id
                    ? itemById.get(s.alternative_item_id)
                    : undefined;
                  const room = s.room_id ? roomById.get(s.room_id) : undefined;
                  const canDelete =
                    mode === "client" && s.created_by === user?.id && s.status === "proposed";
                  return (
                    <li key={s.id} className="space-y-3 rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          {s.colour_hex ? (
                            <span
                              className="mt-0.5 inline-block size-10 shrink-0 rounded-md border"
                              style={{ backgroundColor: s.colour_hex }}
                              aria-label={`Colour ${s.colour_hex}`}
                            />
                          ) : product && safeUrl(product.image_url) ? (
                            <img
                              src={safeUrl(product.image_url) ?? undefined}
                              alt=""
                              className="size-10 shrink-0 rounded-md border object-cover"
                            />
                          ) : (
                            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
                              <KindIcon kind={s.kind} />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {SELECTION_KIND_LABELS[s.kind as SelectionKind] ?? s.kind}
                              {room ? ` · ${room.name}` : s.area_label ? ` · ${s.area_label}` : ""}
                              {s.colour_hex ? ` · ${s.colour_hex}` : ""}
                              {s.created_by_name ? ` · ${s.created_by_name}` : ""}
                              {` · ${new Date(s.created_at).toLocaleDateString("en-GB")}`}
                            </p>
                            {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                            {s.attachment_path && (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0"
                                onClick={() =>
                                  void openFile(s.attachment_path!, s.title).catch((e: unknown) =>
                                    toast.error(
                                      e instanceof Error ? e.message : "Could not open it.",
                                    ),
                                  )
                                }
                              >
                                Open attachment
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant={statusVariant(s.status)}>
                            {selectionStatusLabel(s.status)}
                          </Badge>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(s)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                              <span className="sr-only">Remove {s.title}</span>
                            </Button>
                          )}
                          {mode === "team" && (
                            <Button variant="outline" size="sm" onClick={() => setAnswering(s)}>
                              {s.responded_at ? "Change answer" : "Answer"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {(s.team_response || s.alternative_title || alternative) && (
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Design team{s.responded_by_name ? ` · ${s.responded_by_name}` : ""}
                            {s.responded_at
                              ? ` · ${new Date(s.responded_at).toLocaleDateString("en-GB")}`
                              : ""}
                          </p>
                          {s.team_response && <p className="mt-1">{s.team_response}</p>}
                          {(s.alternative_title || alternative) && (
                            <p className="mt-1">
                              <span className="font-medium">Proposed instead: </span>
                              {s.alternative_title || alternative?.name}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </QueryState>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={category === "all" ? "default" : "outline"}
                  onClick={() => setCategory("all")}
                >
                  All
                </Button>
                {categories.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={category === c ? "default" : "outline"}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
            <QueryState
              isLoading={showcase.isLoading}
              error={showcase.error}
              isEmpty={items.length === 0}
              onRetry={() => void showcase.refetch()}
              empty={
                <EmptyState
                  title="No products to show yet"
                  description={
                    mode === "client"
                      ? "UZA is preparing a selection of tiles, fittings and finishes for you. You can still propose a colour, a reference picture or an idea."
                      : "Mark catalog items as 'Show to clients' in the Catalog (with a picture or 3D link) and they will appear here."
                  }
                />
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleItems.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    onPropose={mode === "client" ? proposeProduct : undefined}
                  />
                ))}
              </div>
            </QueryState>
          </TabsContent>
        </Tabs>
      </CardContent>

      {draft && (
        <ProposalDialog
          draft={draft}
          setDraft={setDraft}
          items={items}
          rooms={rooms.data ?? []}
          pending={create.isPending}
          onSubmit={() => create.mutate(draft)}
        />
      )}
      {answering && (
        <AnswerDialog
          selection={answering}
          items={items}
          onClose={() => setAnswering(null)}
          onDone={() => {
            setAnswering(null);
            void queryClient.invalidateQueries({ queryKey: selectionsKey });
          }}
        />
      )}
    </Card>
  );
}

function ProposalDialog({
  draft,
  setDraft,
  items,
  rooms,
  pending,
  onSubmit,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  items: ShowcaseItem[];
  rooms: { id: string; name: string }[];
  pending: boolean;
  onSubmit: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New proposal</DialogTitle>
          <DialogDescription>
            Tell the design team what you would like. They will confirm it or suggest an
            alternative.
          </DialogDescription>
        </DialogHeader>
        <form
          id="proposal-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-1">
            <Label>What kind of proposal?</Label>
            <Select value={draft.kind} onValueChange={(v) => set({ kind: v as SelectionKind })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SELECTION_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.kind === "product" && (
            <div className="space-y-1">
              <Label>Product</Label>
              <Select
                value={draft.catalogItemId}
                onValueChange={(v) => {
                  const item = items.find((i) => i.id === v);
                  set({ catalogItemId: v, title: draft.title || item?.name || "" });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose from UZA's selection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    Something not in the list (describe it below)
                  </SelectItem>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.category} — {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {draft.kind === "colour" && (
            <div className="space-y-1">
              <Label htmlFor="proposal-colour">Colour</Label>
              <div className="flex items-center gap-3">
                <input
                  id="proposal-colour"
                  type="color"
                  value={draft.colourHex}
                  onChange={(e) => set({ colourHex: e.target.value })}
                  className="h-10 w-16 cursor-pointer rounded border bg-transparent"
                />
                <span className="tabular text-sm text-muted-foreground">{draft.colourHex}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="proposal-title">Short name</Label>
            <Input
              id="proposal-title"
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={
                draft.kind === "colour"
                  ? "e.g. Warm sand for the living room walls"
                  : "e.g. Large grey tiles in the bathroom"
              }
              required
            />
          </div>

          {rooms.length > 0 ? (
            <div className="space-y-1">
              <Label>Room</Label>
              <Select value={draft.roomId} onValueChange={(v) => set({ roomId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Whole project / not room-specific</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="proposal-area">Where? (optional)</Label>
              <Input
                id="proposal-area"
                value={draft.areaLabel}
                onChange={(e) => set({ areaLabel: e.target.value })}
                placeholder="e.g. Master bathroom"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="proposal-notes">Details (optional)</Label>
            <Textarea
              id="proposal-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Size, finish, budget, what you like about it…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="proposal-attachment">Picture or PDF (optional)</Label>
            <Input
              id="proposal-attachment"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => set({ attachment: e.target.files?.[0] ?? null })}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button type="submit" form="proposal-form" disabled={pending || !draft.title.trim()}>
            {pending ? "Adding…" : "Add proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnswerDialog({
  selection,
  items,
  onClose,
  onDone,
}: {
  selection: ClientSelection;
  items: ShowcaseItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<SelectionStatus>(
    selection.status === "proposed" ? "in_review" : (selection.status as SelectionStatus),
  );
  const [response, setResponse] = useState(selection.team_response ?? "");
  const [altTitle, setAltTitle] = useState(selection.alternative_title ?? "");
  const [altItem, setAltItem] = useState(selection.alternative_item_id ?? NONE);

  const save = useMutation({
    mutationFn: () =>
      respondToSelection({
        id: selection.id,
        status,
        response,
        alternativeTitle: status === "customised" ? altTitle : null,
        alternativeItemId: status === "customised" && altItem !== NONE ? altItem : null,
      }),
    onSuccess: () => {
      toast.success("Answer saved. The client sees it on their design board.");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save that answer."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Answer “{selection.title}”</DialogTitle>
          <DialogDescription>
            The client sees your answer and your name. Keep cost and supplier details out of it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Decision</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SelectionStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTION_STATUSES.filter((s) => s !== "proposed").map((s) => (
                  <SelectItem key={s} value={s}>
                    {SELECTION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === "customised" && (
            <>
              <div className="space-y-1">
                <Label>Alternative from the client selection (optional)</Label>
                <Select value={altItem} onValueChange={setAltItem}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None — describe it below</SelectItem>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.category} — {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="alt-title">What you propose instead</Label>
                <Input
                  id="alt-title"
                  value={altTitle}
                  onChange={(e) => setAltTitle(e.target.value)}
                  placeholder="e.g. Same tone in 60×120 matt — better for a wet floor"
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="team-response">
              Message to the client
              {status === "customised" || status === "declined" ? "" : " (optional)"}
            </Label>
            <Textarea
              id="team-response"
              rows={3}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save answer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
