import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Languages, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryState, EmptyState } from "@/components/DataState";
import { translateMessage } from "@/lib/translate.functions";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type SupplierMessageInsert = Database["public"]["Tables"]["supplier_messages"]["Insert"];

type Side = "uza" | "factory";

/** The two-language strings this thread shows, picked by who is reading. */
const COPY: Record<
  Side,
  {
    empty: string;
    emptyBody: string;
    placeholder: string;
    send: string;
    translate: string;
    label: string;
  }
> = {
  factory: {
    empty: "No messages yet · 暂无消息",
    emptyBody:
      "Ask UZA about the specification, quantities or delivery here · 如对规格、数量或交货有疑问，请在此留言",
    placeholder: "Write to UZA in English or Chinese · 可用中文或英文给 UZA 留言",
    send: "Send · 发送",
    translate: "Translate · 翻译",
    label: "Message to UZA · 给 UZA 的消息",
  },
  uza: {
    empty: "No messages with this factory yet",
    emptyBody:
      "Messages you send here reach only this factory. Never name the client, the project or its site — the database refuses it.",
    placeholder: "Write to the factory (English or Chinese). Never name the client or the project.",
    send: "Send",
    translate: "Translate",
    label: "Message to the factory",
  },
};

/** Database errors raised by assert_factory_safe() start with this. */
const CONFIDENTIALITY_ERROR = "This text names the client";

function errorMessage(e: unknown): string {
  const message =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (message.startsWith(CONFIDENTIALITY_ERROR)) return message;
  return message || "Could not send that message.";
}

/**
 * One package's private thread between UZA and one factory. A factory reads
 * and writes only its own thread (RLS); staff see each factory's thread
 * separately — no factory ever sees another's. The database stamps who wrote
 * each message and refuses a UZA message that names the client, the project
 * or its location.
 */
export function SupplierThread({
  packageId,
  supplierId,
  side,
}: {
  packageId: string;
  supplierId: string;
  side: Side;
}) {
  const queryClient = useQueryClient();
  const translate = useServerFn(translateMessage);
  const [body, setBody] = useState("");
  const [translating, setTranslating] = useState<string | null>(null);
  const copy = COPY[side];
  const key = ["supplier-messages", packageId, supplierId] as const;

  const messages = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_messages")
        .select("id, author_name, author_side, body, translated_body, translated_lang, created_at")
        .eq("package_id", packageId)
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text)
        throw new Error(
          side === "factory" ? "Write a message first · 请先输入内容" : "Write a message first.",
        );
      // project_id, author and side are set by the database from the package
      // and the signed-in account (guard_supplier_message); what is sent for
      // them here is ignored.
      const row = {
        package_id: packageId,
        supplier_id: supplierId,
        body: text.slice(0, 6000),
        author_side: side,
      } as SupplierMessageInsert;
      const { error } = await supabase.from("supplier_messages").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: unknown) => toast.error(errorMessage(e), { duration: 8000 }),
  });

  const target: "en" | "zh" = side === "factory" ? "zh" : "en";

  const storeTranslation = useMutation({
    mutationFn: async (m: { id: string; body: string }) => {
      const result = await translate({ data: { text: m.body, target } });
      const { error } = await supabase
        .from("supplier_messages")
        .update({ translated_body: result.translated, translated_lang: result.language })
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (e: unknown) => toast.error(errorMessage(e)),
    onSettled: () => setTranslating(null),
  });

  const rows = messages.data ?? [];

  return (
    <div className="space-y-4">
      <QueryState
        isLoading={messages.isLoading}
        error={messages.error}
        isEmpty={rows.length === 0}
        onRetry={() => void messages.refetch()}
        empty={<EmptyState title={copy.empty} description={copy.emptyBody} />}
      >
        <ol className="space-y-3">
          {rows.map((m) => {
            const mine = m.author_side === side;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] space-y-1 rounded-lg border px-3 py-2 text-sm",
                    mine ? "bg-primary/5" : "bg-card",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {m.author_name ?? (m.author_side === "uza" ? "UZA" : "Factory")} ·{" "}
                    {new Date(m.created_at).toLocaleString(side === "factory" ? "zh-CN" : "en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.translated_body && (
                    <p className="whitespace-pre-wrap border-t pt-1 text-muted-foreground">
                      <span className="mr-1 text-[10px] uppercase tracking-wide">
                        {m.translated_lang === "zh" ? "中文" : "EN"}
                      </span>
                      {m.translated_body}
                    </p>
                  )}
                  {!mine && m.translated_lang !== target && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      disabled={translating !== null}
                      onClick={() => {
                        setTranslating(m.id);
                        storeTranslation.mutate({ id: m.id, body: m.body });
                      }}
                    >
                      <Languages className="size-3" aria-hidden />
                      {translating === m.id ? "…" : copy.translate}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </QueryState>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <Label htmlFor={`thread-${packageId}-${supplierId}`} className="sr-only">
          {copy.label}
        </Label>
        <Textarea
          id={`thread-${packageId}-${supplierId}`}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={copy.placeholder}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={send.isPending || !body.trim()}>
            <Send className="size-4" aria-hidden /> {send.isPending ? "…" : copy.send}
          </Button>
        </div>
      </form>
    </div>
  );
}
