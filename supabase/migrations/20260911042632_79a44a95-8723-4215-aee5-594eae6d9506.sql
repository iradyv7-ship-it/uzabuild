CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.portfolio_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  client_display_name text,
  client_consented boolean NOT NULL DEFAULT false,
  location text,
  country text NOT NULL DEFAULT 'Rwanda',
  project_type text NOT NULL DEFAULT 'other',
  year integer,
  status text NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed')),
  summary text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT '',
  product_families text[] NOT NULL DEFAULT '{}',
  quality_tier text,
  cover_url text,
  gallery_urls text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT ON public.portfolio_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_entries TO authenticated;
GRANT ALL ON public.portfolio_entries TO service_role;
ALTER TABLE public.portfolio_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_public_read" ON public.portfolio_entries
  FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE POLICY "portfolio_admin_read" ON public.portfolio_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'));

CREATE POLICY "portfolio_admin_write" ON public.portfolio_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'));

CREATE POLICY "portfolio_admin_update" ON public.portfolio_entries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'));

CREATE POLICY "portfolio_admin_delete" ON public.portfolio_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER portfolio_entries_updated_at BEFORE UPDATE ON public.portfolio_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  project_type text NOT NULL DEFAULT 'other',
  location text,
  scale text,
  target_date date,
  quality_tier text,
  budget_band text,
  brief text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.project_enquiries TO anon;
GRANT SELECT, INSERT, UPDATE ON public.project_enquiries TO authenticated;
GRANT ALL ON public.project_enquiries TO service_role;
ALTER TABLE public.project_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enquiry_public_insert" ON public.project_enquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "enquiry_staff_read" ON public.project_enquiries
  FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'client'));

CREATE POLICY "enquiry_staff_update" ON public.project_enquiries
  FOR UPDATE TO authenticated
  USING (NOT public.has_role(auth.uid(), 'client'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'client'));

CREATE TRIGGER project_enquiries_updated_at BEFORE UPDATE ON public.project_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();