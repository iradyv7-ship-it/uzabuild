-- 1. Drop the legacy "readable by any signed-in user" catalog policies.
DROP POLICY IF EXISTS "items readable" ON public.catalog_items;
DROP POLICY IF EXISTS "categories readable" ON public.catalog_categories;
DROP POLICY IF EXISTS "price history readable" ON public.catalog_price_history;

-- 2. BOQ lines carry rates: cost-visible team only.
DROP POLICY IF EXISTS "team read boq_lines" ON public.boq_lines;
DROP POLICY IF EXISTS "team write boq_lines" ON public.boq_lines;
CREATE POLICY "Internal team reads boq lines" ON public.boq_lines
  FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes boq lines" ON public.boq_lines
  FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()))
  WITH CHECK (public.can_see_costs(project_id, auth.uid()));

-- 3. Hide the factory RMB column from ordinary reads; internal staff use a checked helper.
REVOKE SELECT ON public.proforma_lines FROM authenticated;
GRANT SELECT (id, proforma_id, project_id, description, description_source, specification,
              unit, quantity, unit_price_usd_minor, sort_order, created_at)
  ON public.proforma_lines TO authenticated;

CREATE OR REPLACE FUNCTION public.internal_proforma_lines(_proforma_id uuid)
RETURNS SETOF public.proforma_lines
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.*
  FROM public.proforma_lines l
  WHERE l.proforma_id = _proforma_id
    AND public.can_access_project(l.project_id, auth.uid())
    AND NOT public.is_client_user(auth.uid())
  ORDER BY l.sort_order
$$;
REVOKE ALL ON FUNCTION public.internal_proforma_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_proforma_lines(uuid) TO authenticated;

-- 4. Never grant admin from self-supplied sign-up metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF requested IS NOT NULL AND requested <> 'admin'
     AND requested IN ('architect','qs','interior_designer','mep_engineer','client','procurement','project_manager') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, requested::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_bootstrap_emails b
    WHERE lower(b.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;