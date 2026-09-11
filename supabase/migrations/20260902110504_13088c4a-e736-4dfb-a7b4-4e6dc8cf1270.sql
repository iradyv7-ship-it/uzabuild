-- ============================================================
-- Access helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_client_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'client')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'client');
$$;

CREATE OR REPLACE FUNCTION public.can_see_costs(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_project(_project_id, _user_id) AND NOT public.is_client_user(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'client');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_catalog(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'qs') OR public.has_role(_user_id,'procurement');
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_client_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_see_costs(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_internal_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_catalog(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_client_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_see_costs(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_catalog(uuid) TO authenticated, service_role;

-- ============================================================
-- Clients
-- ============================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  country text NOT NULL DEFAULT 'Rwanda',
  city text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users read clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));
CREATE POLICY "Internal users create clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Internal users update clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.is_internal_user(auth.uid())) WITH CHECK (public.is_internal_user(auth.uid()));
CREATE POLICY "Admins delete clients" ON public.clients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Projects: client link + stage machine
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'intake',
  ADD COLUMN IF NOT EXISTS budget_band text,
  ADD COLUMN IF NOT EXISTS theme_notes text,
  ADD COLUMN IF NOT EXISTS target_completion date;

CREATE TABLE public.project_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage text NOT NULL,
  note text,
  entered_by uuid REFERENCES auth.users(id),
  entered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_stage_events TO authenticated;
GRANT ALL ON public.project_stage_events TO service_role;
ALTER TABLE public.project_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project team reads stage events" ON public.project_stage_events FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team records stage events" ON public.project_stage_events FOR INSERT TO authenticated
  WITH CHECK (public.can_see_costs(project_id, auth.uid()) AND entered_by = auth.uid());

-- ============================================================
-- Elements (below rooms)
-- ============================================================
CREATE TABLE public.elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  element_type text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'no',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elements TO authenticated;
GRANT ALL ON public.elements TO service_role;
ALTER TABLE public.elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project team reads elements" ON public.elements FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team writes elements" ON public.elements FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER elements_updated BEFORE UPDATE ON public.elements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Suppliers + catalog extensions
-- ============================================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'Rwanda',
  contact_name text,
  email text,
  phone text,
  lead_time_days integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));
CREATE POLICY "Catalog managers write suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (public.can_manage_catalog(auth.uid())) WITH CHECK (public.can_manage_catalog(auth.uid()));
CREATE TRIGGER suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS unit_cost_minor bigint NOT NULL DEFAULT 0;

ALTER TABLE public.catalog_price_history
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text;

-- ============================================================
-- Takeoff lines + corrections (the learning loop)
-- ============================================================
CREATE TABLE public.takeoff_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  element_id uuid REFERENCES public.elements(id) ON DELETE SET NULL,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  drawing_id uuid REFERENCES public.drawings(id) ON DELETE SET NULL,
  description text NOT NULL,
  unit text NOT NULL,
  measurement_method text NOT NULL DEFAULT 'area',
  material_category text,
  ai_quantity numeric,
  ai_confidence numeric CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_source text,
  ai_rationale text,
  human_quantity numeric,
  status text NOT NULL DEFAULT 'draft',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.takeoff_lines TO authenticated;
GRANT ALL ON public.takeoff_lines TO service_role;
ALTER TABLE public.takeoff_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads takeoff" ON public.takeoff_lines FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes takeoff" ON public.takeoff_lines FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER takeoff_lines_updated BEFORE UPDATE ON public.takeoff_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.takeoff_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_line_id uuid REFERENCES public.takeoff_lines(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  material_category text,
  field text NOT NULL DEFAULT 'quantity',
  before_value numeric,
  after_value numeric,
  before_json jsonb,
  after_json jsonb,
  reason text NOT NULL,
  role_tag public.app_role,
  corrected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.takeoff_corrections TO authenticated;
GRANT ALL ON public.takeoff_corrections TO service_role;
ALTER TABLE public.takeoff_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads corrections" ON public.takeoff_corrections FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team records corrections" ON public.takeoff_corrections FOR INSERT TO authenticated
  WITH CHECK (public.can_see_costs(project_id, auth.uid()) AND corrected_by = auth.uid());

-- ============================================================
-- BOQ versions
-- ============================================================
CREATE TABLE public.boq_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  price_basis_date date NOT NULL DEFAULT current_date,
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  net_minor bigint NOT NULL DEFAULT 0,
  preliminaries_minor bigint NOT NULL DEFAULT 0,
  contingency_minor bigint NOT NULL DEFAULT 0,
  vat_minor bigint NOT NULL DEFAULT 0,
  grand_total_minor bigint NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);
GRANT SELECT, INSERT, UPDATE ON public.boq_versions TO authenticated;
GRANT ALL ON public.boq_versions TO service_role;
ALTER TABLE public.boq_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads boq versions" ON public.boq_versions FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team creates boq versions" ON public.boq_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_see_costs(project_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Internal team updates boq versions" ON public.boq_versions FOR UPDATE TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER boq_versions_updated BEFORE UPDATE ON public.boq_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.boq_lines
  ADD COLUMN IF NOT EXISTS boq_version_id uuid REFERENCES public.boq_versions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS takeoff_line_id uuid REFERENCES public.takeoff_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS element_id uuid REFERENCES public.elements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_rate_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_minor bigint NOT NULL DEFAULT 0;

-- ============================================================
-- Proposals
-- ============================================================
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_version_id uuid REFERENCES public.boq_versions(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  scope_notes text,
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  client_price_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  accepted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project team reads proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team writes proposals" ON public.proposals FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER proposals_updated BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Procurement chain
-- ============================================================
CREATE TABLE public.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_version_id uuid REFERENCES public.boq_versions(id) ON DELETE SET NULL,
  reference text,
  status text NOT NULL DEFAULT 'draft',
  needed_by date,
  notes text,
  requested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO authenticated;
GRANT ALL ON public.requisitions TO service_role;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads requisitions" ON public.requisitions FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes requisitions" ON public.requisitions FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER requisitions_updated BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_lines TO authenticated;
GRANT ALL ON public.requisition_lines TO service_role;
ALTER TABLE public.requisition_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads requisition lines" ON public.requisition_lines FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes requisition lines" ON public.requisition_lines FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));

CREATE TABLE public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  due_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfqs TO authenticated;
GRANT ALL ON public.rfqs TO service_role;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads rfqs" ON public.rfqs FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes rfqs" ON public.rfqs FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER rfqs_updated BEFORE UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.rfq_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requisition_line_id uuid REFERENCES public.requisition_lines(id) ON DELETE SET NULL,
  description text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  quoted_unit_cost_minor bigint,
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  lead_time_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_lines TO authenticated;
GRANT ALL ON public.rfq_lines TO service_role;
ALTER TABLE public.rfq_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads rfq lines" ON public.rfq_lines FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes rfq lines" ON public.rfq_lines FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  rfq_id uuid REFERENCES public.rfqs(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  currency public.currency_code NOT NULL DEFAULT 'RWF',
  total_minor bigint NOT NULL DEFAULT 0,
  issued_at timestamptz,
  expected_at date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads purchase orders" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes purchase orders" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER purchase_orders_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal team reads po lines" ON public.purchase_order_lines FOR SELECT TO authenticated
  USING (public.can_see_costs(project_id, auth.uid()));
CREATE POLICY "Internal team writes po lines" ON public.purchase_order_lines FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));

CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'expected',
  expected_at date,
  delivered_at timestamptz,
  received_by uuid REFERENCES auth.users(id),
  receiver_name text,
  site_note text,
  proof_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project team reads deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team writes deliveries" ON public.deliveries FOR ALL TO authenticated
  USING (public.can_see_costs(project_id, auth.uid())) WITH CHECK (public.can_see_costs(project_id, auth.uid()));
CREATE TRIGGER deliveries_updated BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- External specialist invitations
-- ============================================================
CREATE TABLE public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id),
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invitations TO authenticated;
GRANT ALL ON public.project_invitations TO service_role;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project team reads invitations" ON public.project_invitations FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Project owners manage invitations" ON public.project_invitations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );
CREATE TRIGGER project_invitations_updated BEFORE UPDATE ON public.project_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Drawings: human takeoff queue instead of silent failure
-- ============================================================
ALTER TABLE public.drawings
  ADD COLUMN IF NOT EXISTS requires_human_takeoff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_takeoff_reason text,
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'drawing';

-- ============================================================
-- Cost-blind clients: tighten catalog + price history reads
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Authenticated can read categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Authenticated can read price history" ON public.catalog_price_history;
CREATE POLICY "Internal users read catalog items" ON public.catalog_items FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));
CREATE POLICY "Internal users read categories" ON public.catalog_categories FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));
CREATE POLICY "Internal users read price history" ON public.catalog_price_history FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_takeoff_lines_project ON public.takeoff_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_lines_version ON public.boq_lines(boq_version_id);
CREATE INDEX IF NOT EXISTS idx_corrections_project ON public.takeoff_corrections(project_id);
CREATE INDEX IF NOT EXISTS idx_stage_events_project ON public.project_stage_events(project_id);