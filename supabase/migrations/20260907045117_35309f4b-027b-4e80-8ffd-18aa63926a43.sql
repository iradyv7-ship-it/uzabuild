DROP POLICY IF EXISTS "team write approvals" ON public.approvals;
DROP POLICY IF EXISTS "approve own seat" ON public.approvals;

CREATE POLICY "Sign off only your own role"
ON public.approvals FOR INSERT TO authenticated
WITH CHECK (
  approved_by = auth.uid()
  AND public.has_role(auth.uid(), role)
  AND public.can_access_project(project_id, auth.uid())
  AND NOT public.is_client_user(auth.uid())
);

CREATE POLICY "Withdraw only your own sign-off"
ON public.approvals FOR DELETE TO authenticated
USING (
  approved_by = auth.uid()
  AND public.can_access_project(project_id, auth.uid())
  AND NOT public.is_client_user(auth.uid())
);

CREATE POLICY "Admins correct sign-offs"
ON public.approvals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));