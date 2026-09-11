import { cloneElement, isValidElement, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

/**
 * Guided client registration.
 *
 * The record built here is the one printed on the UZA Solutions letterhead of
 * every proforma, so the legal identity fields are asked for first and are
 * mandatory: an invoice against the wrong entity is not a small mistake.
 */

export type ClientDraft = {
  name: string;
  company_registration: string;
  tin: string;
  sector: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  billing_email: string;
  decision_maker_name: string;
  decision_maker_role: string;
  decision_maker_phone: string;
  preferred_language: string;
  source_note: string;
  notes: string;
};

const EMPTY: ClientDraft = {
  name: "",
  company_registration: "",
  tin: "",
  sector: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "Rwanda",
  billing_email: "",
  decision_maker_name: "",
  decision_maker_role: "",
  decision_maker_phone: "",
  preferred_language: "en",
  source_note: "",
  notes: "",
};

const STEPS = [
  {
    title: "Legal identity",
    intent: "Exactly as it must appear on the proforma and the invoice.",
  },
  {
    title: "Contact and address",
    intent: "Where documents are sent and where the entity is registered.",
  },
  {
    title: "Decision path",
    intent: "Who gives final approval on scope, material level and payment.",
  },
  {
    title: "Working notes",
    intent: "How the client came to us and anything the team must know before pricing.",
  },
] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "rw", label: "Kinyarwanda" },
  { value: "zh", label: "Chinese" },
];

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-2">
        {label}
        {required && (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            Required
          </Badge>
        )}
      </Label>
      {isValidElement(children)
        ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}


export function ClientWizard({
  clientId,
  initial,
  onDone,
}: {
  clientId?: string | undefined;
  initial?: Partial<ClientDraft> | undefined;
  onDone?: ((id: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ClientDraft>({ ...EMPTY, ...initial });

  const set = (patch: Partial<ClientDraft>) => setForm((f) => ({ ...f, ...patch }));

  const stepValid = (index: number) => {
    if (index === 0) return form.name.trim().length > 1;
    if (index === 1) return form.country.trim().length > 1 && (form.email.trim() !== "" || form.phone.trim() !== "");
    if (index === 2) return form.decision_maker_name.trim().length > 1;
    return true;
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        company_registration: form.company_registration.trim() || null,
        tin: form.tin.trim() || null,
        sector: form.sector.trim() || null,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim(),
        billing_email: form.billing_email.trim() || null,
        decision_maker_name: form.decision_maker_name.trim() || null,
        decision_maker_role: form.decision_maker_role.trim() || null,
        decision_maker_phone: form.decision_maker_phone.trim() || null,
        preferred_language: form.preferred_language,
        source_note: form.source_note.trim() || null,
        notes: form.notes.trim() || null,
        intake_completed_at: new Date().toISOString(),
      };

      if (clientId) {
        const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
        if (error) throw error;
        return clientId;
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(clientId ? "Client record updated." : "Client registered.");
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client-record"] });
      onDone?.(id);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save this client."),
  });

  const current = STEPS[step]!;

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                i === step ? "border-primary bg-accent font-medium" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="tabular">{i + 1}</span>
              {s.title}
              {stepValid(i) && i !== step && <Check className="size-3" aria-hidden />}
            </button>
          </li>
        ))}
      </ol>

      <div>
        <h3 className="font-medium">{current.title}</h3>
        <p className="text-sm text-muted-foreground">{current.intent}</p>
      </div>

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Registered entity name" required hint="This exact wording is printed on the proforma header.">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="Company registration number">
            <Input value={form.company_registration} onChange={(e) => set({ company_registration: e.target.value })} />
          </Field>
          <Field label="TIN">
            <Input value={form.tin} onChange={(e) => set({ tin: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Sector" hint="Hospitality, residential, institutional, commercial, industrial.">
              <Input value={form.sector} onChange={(e) => set({ sector: e.target.value })} />
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day-to-day contact">
            <Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
          </Field>
          <Field label="Email" required={false}>
            <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Phone" hint="At least one of email or phone is needed.">
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Billing email" hint="Where the proforma and invoice are sent, if different.">
            <Input type="email" value={form.billing_email} onChange={(e) => set({ billing_email: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Registered address">
              <Textarea rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Country" required>
            <Input value={form.country} onChange={(e) => set({ country: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Final approver" required hint="The person who signs off scope, material level and payment.">
            <Input value={form.decision_maker_name} onChange={(e) => set({ decision_maker_name: e.target.value })} />
          </Field>
          <Field label="Their role">
            <Input value={form.decision_maker_role} onChange={(e) => set({ decision_maker_role: e.target.value })} />
          </Field>
          <Field label="Their phone">
            <Input value={form.decision_maker_phone} onChange={(e) => set({ decision_maker_phone: e.target.value })} />
          </Field>
          <Field label="Working language" hint="The language we write to this client in.">
            <Select value={form.preferred_language} onValueChange={(v) => set({ preferred_language: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Field label="How this client reached us">
            <Input value={form.source_note} onChange={(e) => set({ source_note: e.target.value })} />
          </Field>
          <Field label="Internal notes" hint="Never shown to the client.">
            <Textarea rows={4} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!stepValid(step)}>
            Next <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !stepValid(0) || !stepValid(1) || !stepValid(2)}
          >
            {save.isPending ? "Saving…" : clientId ? "Save client record" : "Register client"}
          </Button>
        )}
      </div>
      {(!stepValid(0) || !stepValid(1) || !stepValid(2)) && step === STEPS.length - 1 && (
        <p className="text-xs text-destructive">
          The entity name, a contact route, the country and the final approver must all be filled in before this record
          can head a proforma.
        </p>
      )}
    </div>
  );
}
