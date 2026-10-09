import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/constants/roles";
import {
  ASSISTANT_DISCIPLINES,
  disciplineAssistant,
  type AssistantDiscipline,
} from "@/lib/discipline-assistant.functions";

const PROMPTS: Record<AssistantDiscipline, string> = {
  architect: "Summarise the spaces and levels in the client's drawings and list anything unclear.",
  qs: "What can be measured from these drawings, and what is missing to produce the BOQ?",
  interior_designer:
    "Which of the client's proposals suit their rooms, and what would you customise?",
  mep_engineer:
    "List the electrical, plumbing and HVAC points shown, and what still needs to be sized.",
};

/**
 * The assistant for the seat the user holds. It reads only the documents
 * this person has access to — a client submission appears once a project
 * lead grants it to their seat.
 */
export function DisciplineAssistant({ projectId }: { projectId: string }) {
  const { hasRole } = useAuth();
  const ask = useServerFn(disciplineAssistant);
  const available = ASSISTANT_DISCIPLINES.filter((d) => hasRole(d) || hasRole("admin"));
  const [discipline, setDiscipline] = useState<AssistantDiscipline | undefined>(available[0]);
  const [question, setQuestion] = useState("");

  const run = useMutation({
    mutationFn: () => ask({ data: { projectId, discipline, question } }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "The assistant could not answer."),
  });

  if (available.length === 0 || !discipline) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" aria-hidden /> {roleLabel(discipline)} assistant
        </CardTitle>
        <CardDescription>
          Reads the documents you have access to on this project — including client submissions
          granted to your seat — plus the client's design board. It advises; you decide and sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate();
          }}
        >
          {available.length > 1 && (
            <div className="max-w-xs space-y-1">
              <Label>Seat</Label>
              <Select
                value={discipline}
                onValueChange={(v) => setDiscipline(v as AssistantDiscipline)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((d) => (
                    <SelectItem key={d} value={d}>
                      {roleLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="assistant-question">Question</Label>
            <Textarea
              id="assistant-question"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={PROMPTS[discipline]}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={run.isPending || !question.trim()}>
              {run.isPending ? "Reading the documents…" : "Ask"}
            </Button>
            {!question && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuestion(PROMPTS[discipline])}
              >
                Use the suggested question
              </Button>
            )}
          </div>
        </form>

        {run.data && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{run.data.answer}</p>
            {run.data.documentsRead.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Read {run.data.documentsRead.length} of {run.data.documentsListed} document(s):{" "}
                {run.data.documentsRead.join(", ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
