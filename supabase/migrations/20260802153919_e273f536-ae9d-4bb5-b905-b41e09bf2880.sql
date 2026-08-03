-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','architect','qs','interior_designer','mep_engineer');
CREATE TYPE public.currency_code AS ENUM ('RWF','USD','CNY');
CREATE TYPE public.price_source AS ENUM ('manual','supplier','manufacturer');
CREATE TYPE public.extraction_status AS ENUM ('pending','processing','extracted','failed','validated');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CATALOG
CREATE TABLE public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_categories TO authenticated;
GRANT ALL ON public.catalog_categories TO service_role;
ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories readable" ON public.catalog_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories managed" ON public.catalog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs'));

CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  code text UNIQUE,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'each',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage_per_unit numeric(14,4),
  default_wastage_pct numeric(6,3) NOT NULL DEFAULT 0,
  price numeric(16,4) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  price_source public.price_source NOT NULL DEFAULT 'manual',
  price_date date NOT NULL DEFAULT current_date,
  supplier text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;
GRANT ALL ON public.catalog_items TO service_role;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable" ON public.catalog_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items managed" ON public.catalog_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs') OR public.has_role(auth.uid(),'interior_designer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs') OR public.has_role(auth.uid(),'interior_designer'));
CREATE TRIGGER catalog_items_updated BEFORE UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.catalog_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  price numeric(16,4) NOT NULL,
  currency public.currency_code NOT NULL,
  price_source public.price_source NOT NULL,
  price_date date NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.catalog_price_history TO authenticated;
GRANT ALL ON public.catalog_price_history TO service_role;
ALTER TABLE public.catalog_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price history readable" ON public.catalog_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "price history insert" ON public.catalog_price_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    INSERT INTO public.catalog_price_history (item_id, price, currency, price_source, price_date, changed_by)
    VALUES (NEW.id, NEW.price, NEW.currency, NEW.price_source, NEW.price_date, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER catalog_items_price_log AFTER INSERT OR UPDATE ON public.catalog_items
FOR EACH ROW EXECUTE FUNCTION public.log_price_change();

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  location text,
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  status text NOT NULL DEFAULT 'draft',
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id)
      OR public.has_role(_user_id,'admin');
$$;

CREATE POLICY "projects visible to team" ON public.projects FOR SELECT TO authenticated
  USING (public.can_access_project(id, auth.uid()));
CREATE POLICY "projects insert own" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects update by team" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_access_project(id, auth.uid())) WITH CHECK (public.can_access_project(id, auth.uid()));
CREATE POLICY "projects delete by owner" ON public.projects FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "members visible to team" ON public.project_members FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members managed by owner" ON public.project_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  house_type text,
  quantity int NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  level int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_type text,
  floor_area_m2 numeric(14,3) NOT NULL DEFAULT 0,
  wall_area_m2 numeric(14,3) NOT NULL DEFAULT 0,
  perimeter_m numeric(14,3) NOT NULL DEFAULT 0,
  ceiling_height_m numeric(8,3) NOT NULL DEFAULT 2.8,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.boq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES public.floors(id) ON DELETE CASCADE,
  house_id uuid REFERENCES public.houses(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  measurement_method text NOT NULL DEFAULT 'count',
  measurement_note text,
  base_quantity numeric(16,4) NOT NULL DEFAULT 0,
  wastage_pct numeric(6,3) NOT NULL DEFAULT 0,
  quantity numeric(16,4) NOT NULL DEFAULT 0,
  pinned_rate numeric(16,4),
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  source text NOT NULL DEFAULT 'human',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER boq_lines_updated BEFORE UPDATE ON public.boq_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  stage text NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_name text,
  boq_version int NOT NULL DEFAULT 1,
  notes text,
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text,
  size_bytes bigint,
  status public.extraction_status NOT NULL DEFAULT 'pending',
  extraction jsonb,
  error text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER drawings_updated BEFORE UPDATE ON public.drawings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.solar_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  solar_share_pct int NOT NULL,
  grid_share_pct int NOT NULL,
  daily_load_kwh numeric(14,3) NOT NULL DEFAULT 0,
  peak_load_kw numeric(14,3) NOT NULL DEFAULT 0,
  array_kwp numeric(14,3) NOT NULL DEFAULT 0,
  battery_kwh numeric(14,3) NOT NULL DEFAULT 0,
  inverter_kw numeric(14,3) NOT NULL DEFAULT 0,
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, solar_share_pct)
);
CREATE TABLE public.solar_proposal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.solar_proposals(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  quantity numeric(16,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage text NOT NULL,
  role_tag public.app_role,
  ai_draft jsonb,
  human_final jsonb,
  diff jsonb,
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['houses','floors','rooms','boq_lines','approvals','drawings','solar_proposals','solar_proposal_lines','training_records']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "team read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "team write %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()))', t);
  END LOOP;
END $$;

-- approvals: only in your own seat
CREATE POLICY "approve own seat" ON public.approvals FOR INSERT TO authenticated
  WITH CHECK (approved_by = auth.uid() AND public.has_role(auth.uid(), role) AND public.can_access_project(project_id, auth.uid()));

-- SETTINGS
CREATE TABLE public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  value numeric(16,4) NOT NULL,
  unit text,
  category text NOT NULL DEFAULT 'general',
  confidence text NOT NULL DEFAULT 'ASSUMED',
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.business_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings managed" ON public.business_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'qs'));

INSERT INTO public.catalog_categories (name, slug, sort_order) VALUES
 ('Flooring','flooring',1),('Lighting','lighting',2),('Sanitary','sanitary',3),
 ('Kitchen Cabinetry','kitchen',4),('Electronics','electronics',5),('Smart Home','smart-home',6),
 ('Solar','solar',7),('Ceilings & Gypsum','ceilings',8),('Aluminium Windows & Doors','aluminium',9),
 ('Interior Doors','doors',10),('Acoustics','acoustics',11),('Air Conditioning','ac',12);

INSERT INTO public.business_settings (key,label,value,unit,category,confidence) VALUES
 ('tile_wastage_pct','Tile wastage',10,'%','wastage','CONFIRMED'),
 ('paint_wastage_pct','Paint wastage',5,'%','wastage','ASSUMED'),
 ('peak_sun_hours','Peak sun hours (Rwanda)',5.0,'h/day','solar','CONFIRMED'),
 ('battery_depth_of_discharge','Battery depth of discharge',0.8,'ratio','solar','ASSUMED'),
 ('system_derate_factor','Solar system derate factor',0.8,'ratio','solar','ASSUMED'),
 ('battery_autonomy_hours','Battery autonomy',8,'h','solar','ASSUMED');