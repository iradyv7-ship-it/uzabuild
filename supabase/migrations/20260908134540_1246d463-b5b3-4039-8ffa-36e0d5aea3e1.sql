-- A client seat may read the client record attached to a project it belongs to
-- (its own company identity on the proforma letterhead) — nothing else.
CREATE POLICY "Clients read their own company record"
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.client_id = clients.id
      AND public.can_access_project(p.id, auth.uid())
  )
);