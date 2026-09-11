DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND cmd='UPDATE' LOOP
    EXECUTE format('DROP POLICY %I ON public.projects', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Internal team updates projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.can_see_costs(id, auth.uid()))
  WITH CHECK (public.can_see_costs(id, auth.uid()));