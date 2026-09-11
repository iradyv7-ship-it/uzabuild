-- 1. Client registration detail
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS company_registration text,
  ADD COLUMN IF NOT EXISTS tin text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS decision_maker_name text,
  ADD COLUMN IF NOT EXISTS decision_maker_role text,
  ADD COLUMN IF NOT EXISTS decision_maker_phone text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_key ON public.clients (client_code) WHERE client_code IS NOT NULL;

-- 2. Guided discovery / missing information register
CREATE TABLE public.project_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  section text NOT NULL,
  question_key text NOT NULL,
  question text NOT NULL,
  guidance text,
  client_answer text,
  internal_note text,
  owner_role app_role,
  status text NOT NULL DEFAULT 'missing',
  confidence text NOT NULL DEFAULT 'assumed',
  blocks_procurement boolean NOT NULL DEFAULT false,
  client_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  answered_by uuid REFERENCES auth.users(id),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, question_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_discovery TO authenticated;
GRANT ALL ON public.project_discovery TO service_role;
ALTER TABLE public.project_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project people read discovery"
  ON public.project_discovery FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid())
         AND (client_visible OR NOT public.is_client_user(auth.uid())));

CREATE POLICY "Internal people write discovery"
  ON public.project_discovery FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE TRIGGER project_discovery_updated BEFORE UPDATE ON public.project_discovery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Coordination threads (no private inboxes: every conversation lives on a project)
CREATE TABLE public.coordination_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  purpose text,
  scope text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.coordination_threads(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  email text,
  display_name text NOT NULL,
  party_type text NOT NULL DEFAULT 'internal',
  organisation text,
  can_write boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.coordination_threads(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  author_name text NOT NULL,
  body text NOT NULL,
  source_language text NOT NULL DEFAULT 'en',
  translated_body text,
  translated_language text,
  attachment_path text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.thread_participants p WHERE p.thread_id = _thread_id AND p.user_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.can_see_thread(_thread_id uuid, _project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_thread_participant(_thread_id, _user_id)
      OR (public.can_access_project(_project_id, _user_id) AND NOT public.is_client_user(_user_id));
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_thread(uuid, uuid, uuid) FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_threads TO authenticated;
GRANT ALL ON public.coordination_threads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_participants TO authenticated;
GRANT ALL ON public.thread_participants TO service_role;
GRANT SELECT, INSERT ON public.thread_messages TO authenticated;
GRANT ALL ON public.thread_messages TO service_role;

ALTER TABLE public.coordination_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and internal team read threads"
  ON public.coordination_threads FOR SELECT TO authenticated
  USING (public.can_see_thread(id, project_id, auth.uid()));

CREATE POLICY "Internal team creates threads"
  ON public.coordination_threads FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "Internal team updates threads"
  ON public.coordination_threads FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "Thread people read participants"
  ON public.thread_participants FOR SELECT TO authenticated
  USING (public.can_see_thread(thread_id, project_id, auth.uid()));

CREATE POLICY "Internal team manages participants"
  ON public.thread_participants FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "Thread people read messages"
  ON public.thread_messages FOR SELECT TO authenticated
  USING (public.can_see_thread(thread_id, project_id, auth.uid()));

CREATE POLICY "Thread people write messages"
  ON public.thread_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_see_thread(thread_id, project_id, auth.uid()) AND author_id = auth.uid());

CREATE TRIGGER coordination_threads_updated BEFORE UPDATE ON public.coordination_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Proformas (issued by UZA only)
CREATE TABLE public.proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id),
  reference text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  fx_rmb_per_usd numeric NOT NULL DEFAULT 6,
  validity_days integer NOT NULL DEFAULT 15,
  incoterm text,
  lead_time_note text,
  payment_terms text,
  notes text,
  issued_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.proforma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES public.proformas(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  description_source text,
  specification text,
  unit text NOT NULL DEFAULT 'pcs',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_rmb_minor bigint NOT NULL DEFAULT 0,
  unit_price_usd_minor bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proformas TO authenticated;
GRANT ALL ON public.proformas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proforma_lines TO authenticated;
GRANT ALL ON public.proforma_lines TO service_role;

ALTER TABLE public.proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal team manages proformas"
  ON public.proformas FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "Clients read issued proformas"
  ON public.proformas FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND status <> 'draft');

CREATE POLICY "Internal team manages proforma lines"
  ON public.proforma_lines FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "Clients read issued proforma lines"
  ON public.proforma_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = proforma_id AND p.status <> 'draft'
                 AND public.can_access_project(p.project_id, auth.uid())));

CREATE TRIGGER proformas_updated BEFORE UPDATE ON public.proformas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();