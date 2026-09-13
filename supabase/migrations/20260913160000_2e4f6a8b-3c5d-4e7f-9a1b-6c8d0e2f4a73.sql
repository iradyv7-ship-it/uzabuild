-- Per-viewer document acknowledgement, used by Cecilia's workspace ("documents
-- recently uploaded by the founder/client that she hasn't yet acknowledged").
-- Deliberately per (drawing, user) rather than a single flag on `drawings`:
-- acknowledgement is a personal "I have seen this", not a project-wide state,
-- so two different reviewers must each be able to acknowledge the same file
-- independently.
CREATE TABLE public.document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.document_acknowledgements TO authenticated;
GRANT ALL ON public.document_acknowledgements TO service_role;
ALTER TABLE public.document_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "A viewer reads their own acknowledgements" ON public.document_acknowledgements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_project(project_id, auth.uid()));
CREATE POLICY "A viewer acknowledges a document for themselves only" ON public.document_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_access_project_sourcing(project_id, auth.uid())
    AND NOT public.is_client_user(auth.uid())
  );
CREATE POLICY "A viewer withdraws their own acknowledgement" ON public.document_acknowledgements
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
