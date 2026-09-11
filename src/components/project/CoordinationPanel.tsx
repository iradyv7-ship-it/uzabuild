import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Languages, MessageSquare, Paperclip, Plus, Send, User, Users, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryState, EmptyState } from "@/components/DataState";
import { translateMessage } from "@/lib/translate.functions";
import { useAuth } from "@/context/AuthContext";

const SCOPES = [
  { value: "internal", label: "UZA internal only" },
  { value: "factory", label: "UZA + factory" },
  { value: "client_team", label: "UZA + client's engineer / architect" },
  { value: "joint", label: "Joint — UZA, client team and factory" },
];

const PARTY_TYPES = [
  { value: "internal", label: "UZA team" },
  { value: "factory", label: "Factory / supplier" },
  { value: "client_team", label: "Client's engineer or architect" },
];

export function CoordinationPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { user, fullName } = useAuth();
  const translate = useServerFn(translateMessage);
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newThread, setNewThread] = useState({ title: "", purpose: "", scope: "internal" });
  const [participant, setParticipant] = useState({ display_name: "", email: "", organisation: "", party_type: "factory" });
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const threads = useQuery({
    queryKey: ["threads", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coordination_threads")
        .select("id, title, purpose, scope, status, thread_type, created_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const active = activeId ?? threads.data?.[0]?.id ?? null;

  const participants = useQuery({
    queryKey: ["thread-participants", active],
    enabled: !!active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thread_participants")
        .select("id, display_name, organisation, party_type, email")
        .eq("thread_id", active!);
      if (error) throw error;
      return data;
    },
  });

  const messages = useQuery({
    queryKey: ["thread-messages", active],
    enabled: !!active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thread_messages")
        .select("id, author_name, body, source_language, translated_body, attachment_path, attachment_name, created_at")
        .eq("thread_id", active!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  /** People already on this project — a one-to-one is only ever opened with one of them. */
  const members = useQuery({
    queryKey: ["project-members-directory", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, role")
        .eq("project_id", projectId);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: people, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return (data ?? []).map((m) => {
        const p = (people ?? []).find((x) => x.id === m.user_id);
        return {
          user_id: m.user_id,
          role: m.role as string,
          name: p?.full_name ?? p?.email ?? "Team member",
          email: p?.email ?? null,
        };
      });
    },
  });

  /** One-to-one: still a project record, still auditable — never a private inbox. */
  const startDirect = useMutation({
    mutationFn: async (other: { user_id: string; name: string; email: string | null }) => {
      const { data: thread, error } = await supabase
        .from("coordination_threads")
        .insert({
          project_id: projectId,
          title: `${fullName || user?.email || "UZA"} & ${other.name}`,
          purpose: "One-to-one on this project.",
          scope: "internal",
          thread_type: "direct",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: pErr } = await supabase.from("thread_participants").insert([
        {
          thread_id: thread.id,
          project_id: projectId,
          user_id: user?.id ?? null,
          display_name: fullName || user?.email || "UZA",
          party_type: "internal",
        },
        {
          thread_id: thread.id,
          project_id: projectId,
          user_id: other.user_id,
          display_name: other.name,
          email: other.email,
          party_type: "internal",
        },
      ]);
      if (pErr) throw pErr;
      return thread.id;
    },
    onSuccess: (id) => {
      setActiveId(id);
      toast.success("One-to-one opened.");
      void queryClient.invalidateQueries({ queryKey: ["threads", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createThread = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("coordination_threads").insert({
        project_id: projectId,
        title: newThread.title,
        purpose: newThread.purpose || null,
        scope: newThread.scope,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewThread({ title: "", purpose: "", scope: "internal" });
      toast.success("Discussion opened on this project.");
      void queryClient.invalidateQueries({ queryKey: ["threads", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addParticipant = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("Open a discussion first.");
      const { error } = await supabase.from("thread_participants").insert({
        thread_id: active,
        project_id: projectId,
        display_name: participant.display_name,
        email: participant.email || null,
        organisation: participant.organisation || null,
        party_type: participant.party_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setParticipant({ display_name: "", email: "", organisation: "", party_type: "factory" });
      toast.success("Added to this discussion only.");
      void queryClient.invalidateQueries({ queryKey: ["thread-participants", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("Open a discussion first.");
      let path: string | null = null;
      if (attachment) {
        path = `${projectId}/coordination/${crypto.randomUUID()}-${attachment.name}`;
        const { error: upErr } = await supabase.storage.from("drawings").upload(path, attachment);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("thread_messages").insert({
        thread_id: active,
        project_id: projectId,
        author_id: user?.id ?? null,
        author_name: fullName || user?.email || "UZA",
        body,
        // Chinese characters in the text win over the picker: a message must
        // never be filed under a language it plainly is not written in.
        source_language: /[一-鿿]/.test(body) ? "zh" : language,

        attachment_path: path,
        attachment_name: attachment?.name ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setAttachment(null);
      void queryClient.invalidateQueries({ queryKey: ["thread-messages", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function translateOne(id: string, text: string, source: string) {
    try {
      const target = source === "zh" ? "en" : "zh";
      const res = await translate({ data: { text, target } });
      setTranslations((p) => ({ ...p, [id]: res.translated }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed.");
    }
  }

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

  const all = threads.data ?? [];
  const list = all.filter((t) => t.thread_type !== "direct");
  const directs = all.filter((t) => t.thread_type === "direct");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Project discussions</CardTitle>
            <CardDescription>
              Every conversation belongs to this project and to the people invited to it. There are no private inboxes:
              a factory is brought in for a specific question and sees only that discussion.
            </CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> New discussion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Open a discussion</DialogTitle>
                <DialogDescription>Give it a subject so the record stays searchable later.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-title">Subject</Label>
                  <Input
                    id="t-title"
                    value={newThread.title}
                    onChange={(e) => setNewThread({ ...newThread, title: e.target.value })}
                    placeholder="Guest room joinery — confirmed dimensions"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-purpose">What must this discussion settle?</Label>
                  <Textarea
                    id="t-purpose"
                    rows={2}
                    value={newThread.purpose}
                    onChange={(e) => setNewThread({ ...newThread, purpose: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Who is in the room</Label>
                  <Select value={newThread.scope} onValueChange={(scope) => setNewThread({ ...newThread, scope })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createThread.mutate()} disabled={!newThread.title || createThread.isPending}>
                  Open discussion
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={threads.isLoading}
            error={threads.error}
            isEmpty={list.length === 0}
            onRetry={() => void threads.refetch()}
            empty={
              <EmptyState
                title="No discussions yet"
                description="Open one per question that needs settling — a factory clarification, a dimension query for the client's engineer, or an internal read on scope. Each keeps its own participants and its own document trail."
              />
            }
          >
            <div className="flex flex-wrap gap-2">
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    active === t.id ? "border-primary bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{t.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {SCOPES.find((s) => s.value === t.scope)?.label}
                  </span>
                </button>
              ))}
            </div>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4" aria-hidden /> One-to-one
          </CardTitle>
          <CardDescription>
            A private line between two people on this project. It stays attached to the project
            record and is auditable — it is not a separate inbox outside the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QueryState
            isLoading={threads.isLoading}
            error={threads.error}
            isEmpty={directs.length === 0}
            onRetry={() => void threads.refetch()}
            empty={
              <EmptyState
                title="No one-to-one open"
                description="Pick a colleague on this project below to open a direct line with them."
              />
            }
          >
            <div className="flex flex-wrap gap-2">
              {directs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    active === t.id ? "border-primary bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <MessageSquare className="size-4" aria-hidden />
                  <span className="font-medium">{t.title}</span>
                </button>
              ))}
            </div>
          </QueryState>

          <div className="space-y-2 border-t pt-4">
            <Label>Start a one-to-one with someone on this project</Label>
            <QueryState
              isLoading={members.isLoading}
              error={members.error}
              isEmpty={(members.data ?? []).length === 0}
              onRetry={() => void members.refetch()}
              empty={
                <EmptyState
                  title="No one else on this project yet"
                  description="Invite an architect, engineer or colleague under Team and they will appear here."
                />
              }
            >
              <div className="flex flex-wrap gap-2">
                {(members.data ?? [])
                  .filter((m) => m.user_id !== user?.id)
                  .map((m) => (
                    <Button
                      key={m.user_id}
                      size="sm"
                      variant="outline"
                      disabled={startDirect.isPending}
                      onClick={() =>
                        startDirect.mutate({
                          user_id: m.user_id,
                          name: m.name,
                          email: m.email,
                        })
                      }
                    >
                      <MessageSquare className="size-4" aria-hidden /> {m.name}
                    </Button>
                  ))}
              </div>
            </QueryState>
          </div>
        </CardContent>
      </Card>

      {active && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Record</CardTitle>
              <CardDescription>
                Write in English or Chinese; anyone can translate a message without changing what was written.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <QueryState
                isLoading={messages.isLoading}
                error={messages.error}
                isEmpty={(messages.data ?? []).length === 0}
                onRetry={() => void messages.refetch()}
                empty={
                  <EmptyState
                    title="Nothing recorded yet"
                    description="Messages, clarifications and attached documents in this discussion will appear here in order."
                  />
                }
              >
                <div className="space-y-3">
                  {(messages.data ?? []).map((m) => (
                    <div key={m.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{m.author_name}</span>
                        <span className="tabular">{new Date(m.created_at).toLocaleString()}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {m.source_language}
                        </Badge>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
                      {translations[m.id] && (
                        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 text-sm">{translations[m.id]}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void translateOne(m.id, m.body, m.source_language)}
                        >
                          <Languages className="size-4" /> Translate
                        </Button>
                        {m.attachment_path && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void download(m.attachment_path!, m.attachment_name ?? "document")}
                          >
                            <Download className="size-4" /> {m.attachment_name}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </QueryState>

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="msg">Your message</Label>
                <Textarea id="msg" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "zh")}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    aria-label="Attach a document"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="size-4" /> {attachment ? attachment.name : "Attach document"}
                  </Button>
                  <Button size="sm" onClick={() => send.mutate()} disabled={!body.trim() || send.isPending}>
                    <Send className="size-4" /> Send
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" aria-hidden /> In this discussion
              </CardTitle>
              <CardDescription>Access is per discussion, not per project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <QueryState
                isLoading={participants.isLoading}
                error={participants.error}
                isEmpty={(participants.data ?? []).length === 0}
                onRetry={() => void participants.refetch()}
                empty={
                  <EmptyState
                    title="No outside party added"
                    description="The UZA team on this project can already see it. Add a factory contact or the client's engineer when their input is needed."
                  />
                }
              >
                <ul className="space-y-2 text-sm">
                  {(participants.data ?? []).map((p) => (
                    <li key={p.id} className="rounded-md border p-2">
                      <p className="font-medium">{p.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PARTY_TYPES.find((t) => t.value === p.party_type)?.label}
                        {p.organisation ? ` · ${p.organisation}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </QueryState>

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="p-name">Add someone to this discussion</Label>
                <Input
                  id="p-name"
                  placeholder="Name"
                  value={participant.display_name}
                  onChange={(e) => setParticipant({ ...participant, display_name: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  aria-label="Email"
                  value={participant.email}
                  onChange={(e) => setParticipant({ ...participant, email: e.target.value })}
                />
                <Input
                  placeholder="Company"
                  aria-label="Company"
                  value={participant.organisation}
                  onChange={(e) => setParticipant({ ...participant, organisation: e.target.value })}
                />
                <Select
                  value={participant.party_type}
                  onValueChange={(party_type) => setParticipant({ ...participant, party_type })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => addParticipant.mutate()}
                  disabled={!participant.display_name || addParticipant.isPending}
                >
                  Add to this discussion
                </Button>
                <p className="text-xs text-muted-foreground">
                  Commercial terms and proformas are issued by UZA only. Suppliers never see the client's pricing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
