-- product packages -------------------------------------------------
CREATE TABLE public.product_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  package_code text,
  category text NOT NULL,
  title text NOT NULL,
  scope_note text,
  quality_tier text NOT NULL DEFAULT 'value' CHECK (quality_tier IN ('premium','value','economical')),
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  target_budget_minor bigint,
  budget_currency currency_code NOT NULL DEFAULT 'USD',
  required_delivery_date date,
  style_note text,
  colour_note text,
  shape_note text,
  pattern_note text,
  texture_note text,
  finish_note text,
  performance_note text,
  status text NOT NULL DEFAULT 'collecting'
    CHECK (status IN ('collecting','ready_to_source','sourcing','quoted','ordered','closed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_packages_project_idx ON public.product_packages(project_id, priority, seq);

CREATE OR REPLACE FUNCTION public.assign_package_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq integer;
  proj_code text;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_seq
    FROM public.product_packages WHERE project_id = NEW.project_id;
  SELECT project_code INTO proj_code FROM public.projects WHERE id = NEW.project_id;
  NEW.seq := next_seq;
  NEW.package_code := COALESCE(proj_code, 'UZA-P') || '/PK-' || lpad(next_seq::text, 2, '0');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_package_code() FROM anon, authenticated;

CREATE TRIGGER product_packages_code BEFORE INSERT ON public.product_packages
  FOR EACH ROW EXECUTE FUNCTION public.assign_package_code();
CREATE TRIGGER product_packages_updated BEFORE UPDATE ON public.product_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_packages TO authenticated;
GRANT ALL ON public.product_packages TO service_role;
ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal project members read packages" ON public.product_packages
  FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "internal project members write packages" ON public.product_packages
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));

-- brief checklist ---------------------------------------------------
CREATE TABLE public.package_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  owner_party text NOT NULL DEFAULT 'client',
  status text NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing','requested','provided','not_applicable')),
  note text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, requirement_key)
);
CREATE TRIGGER package_requirements_updated BEFORE UPDATE ON public.package_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_requirements TO authenticated;
GRANT ALL ON public.package_requirements TO service_role;
ALTER TABLE public.package_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal project members read package requirements" ON public.package_requirements
  FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "internal project members write package requirements" ON public.package_requirements
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));

-- attachments -------------------------------------------------------
CREATE TABLE public.package_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requirement_key text,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('drawing','boq','specification','rendering','reference_image','sample_photo','other')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caption text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX package_attachments_package_idx ON public.package_attachments(package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_attachments TO authenticated;
GRANT ALL ON public.package_attachments TO service_role;
ALTER TABLE public.package_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal project members read package attachments" ON public.package_attachments
  FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "internal project members write package attachments" ON public.package_attachments
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));

-- manufacturer coverage ---------------------------------------------
CREATE TABLE public.supplier_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category text NOT NULL,
  quality_tier text NOT NULL DEFAULT 'value' CHECK (quality_tier IN ('premium','value','economical')),
  is_preferred boolean NOT NULL DEFAULT false,
  lead_time_days integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, category, quality_tier)
);
CREATE INDEX supplier_categories_category_idx ON public.supplier_categories(category, quality_tier);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_categories TO authenticated;
GRANT ALL ON public.supplier_categories TO service_role;
ALTER TABLE public.supplier_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal users read supplier coverage" ON public.supplier_categories
  FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
CREATE POLICY "catalog managers write supplier coverage" ON public.supplier_categories
  FOR ALL TO authenticated
  USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));

-- package shortlist -------------------------------------------------
CREATE TABLE public.package_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.product_packages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'shortlisted'
    CHECK (status IN ('shortlisted','rfq_sent','quoted','selected','rejected')),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, supplier_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_manufacturers TO authenticated;
GRANT ALL ON public.package_manufacturers TO service_role;
ALTER TABLE public.package_manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal project members read package manufacturers" ON public.package_manufacturers
  FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "internal project members write package manufacturers" ON public.package_manufacturers
  FOR ALL TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));