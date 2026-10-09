-- Client workspace: clients submit technical drawings, follow the work being
-- done on them, and propose finishes (products, colours, references) that the
-- design team answers. Discipline seats (architect, QS, interior designer,
-- MEP engineer) -- and the AI assistants that act through their session --
-- read a client-submitted document only once a project lead grants them it.
--
-- It also closes three read leaks found while building this, all verified by
-- reading the policies rather than assumed:
--
--  1. "team write drawings" (20260802153919) is FOR ALL. In Postgres a FOR ALL
--     policy is also a SELECT policy, so a client seat could still read every
--     internal drawing row -- the 20260913150000 client_visible fix never took
--     effect while it existed. Same FOR ALL shape on houses, floors, rooms,
--     solar_proposals, solar_proposal_lines, training_records and the two
--     Speckle tables let a client WRITE to them.
--  2. "China sourcing reads drawings broadly" (20260913130000) is
--     can_access_project_sourcing(), which includes plain can_access_project --
--     so it also handed every client member every drawing.
--  3. The storage bucket's read policy (20260802153950) is folder-level only:
--     any project member, client included, could list and download every file
--     under the project -- internal drawings, coordination attachments from
--     factory threads, package attachments.

-- ---------------------------------------------------------------------------
-- Drawings: who submitted it, whether it is restricted, where the review is
-- ---------------------------------------------------------------------------
ALTER TABLE public.drawings
  ADD COLUMN IF NOT EXISTS submitted_by_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text
    CHECK (review_status IN ('received','in_review','in_progress','needs_revision','accepted')),
  ADD COLUMN IF NOT EXISTS client_note text;
COMMENT ON COLUMN public.drawings.access_restricted IS
  'True for every client submission. A restricted document is readable only by its uploader, the project leads (owner, project_manager, admin) and whoever a lead grants it to in document_access_grants.';
COMMENT ON COLUMN public.drawings.review_status IS
  'Where the team is with a client submission, shown to the client. NULL for internal uploads.';

CREATE TABLE IF NOT EXISTS public.document_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  grantee_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_role public.app_role,
  note text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((grantee_user_id IS NULL) <> (grantee_role IS NULL)),
  CHECK (grantee_role IS NULL OR grantee_role NOT IN ('client','manufacturer'))
);
CREATE UNIQUE INDEX IF NOT EXISTS document_access_grants_unique_user
  ON public.document_access_grants (drawing_id, grantee_user_id) WHERE grantee_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_access_grants_unique_role
  ON public.document_access_grants (drawing_id, grantee_role) WHERE grantee_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_access_grants_project ON public.document_access_grants (project_id);
COMMENT ON TABLE public.document_access_grants IS
  'Grants one discipline seat (every holder of that role on the project) or one named person read access to a restricted document.';

CREATE TABLE IF NOT EXISTS public.document_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  actor_name text,
  kind text NOT NULL CHECK (kind IN ('received','status','update','comment','access_granted','access_revoked')),
  status text,
  body text,
  client_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_activity_drawing ON public.document_activity (drawing_id, created_at);
COMMENT ON TABLE public.document_activity IS
  'Append-only timeline of the work on a document. Client-visible rows are what the client sees as "work being done"; access changes are internal-only.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_lead(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.project_members m
                 WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.role = 'project_manager');
$$;

CREATE OR REPLACE FUNCTION public.can_read_drawing(_drawing_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drawings d
    WHERE d.id = _drawing_id
      AND public.can_access_project(d.project_id, _user_id)
      AND (
        d.uploaded_by = _user_id
        OR (public.is_client_user(_user_id) AND d.client_visible)
        OR (
          NOT public.is_client_user(_user_id)
          AND (
            NOT d.access_restricted
            OR public.is_project_lead(d.project_id, _user_id)
            OR EXISTS (
              SELECT 1 FROM public.document_access_grants g
              WHERE g.drawing_id = d.id
                AND (g.grantee_user_id = _user_id
                     OR (g.grantee_role IS NOT NULL AND public.has_role(_user_id, g.grantee_role)))
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_storage_object(_name text, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  folder uuid;
BEGIN
  -- A file that belongs to a document follows that document's rule exactly.
  IF EXISTS (SELECT 1 FROM public.drawings d WHERE d.storage_path = _name) THEN
    RETURN EXISTS (SELECT 1 FROM public.drawings d
                   WHERE d.storage_path = _name AND public.can_read_drawing(d.id, _user_id));
  END IF;
  -- A client sees only attachments on their own project's design board.
  IF public.is_client_user(_user_id) THEN
    RETURN EXISTS (SELECT 1 FROM public.client_selections s
                   WHERE s.attachment_path = _name AND public.can_access_project(s.project_id, _user_id));
  END IF;
  -- Internal seats keep project-folder access to coordination and package files.
  BEGIN
    folder := ((storage.foldername(_name))[1])::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN public.can_access_project(folder, _user_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Client design board
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS client_showcase boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS model_url text,
  ADD COLUMN IF NOT EXISTS swatch_hex text CHECK (swatch_hex IS NULL OR swatch_hex ~ '^#[0-9A-Fa-f]{6}$');
COMMENT ON COLUMN public.catalog_items.client_showcase IS
  'Shown to clients on the design board through client_showcase_items() -- name, picture, 3D link and swatch only, never price, supplier or attributes.';

CREATE TABLE IF NOT EXISTS public.client_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  area_label text,
  kind text NOT NULL CHECK (kind IN ('product','colour','reference','idea')),
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  colour_hex text CHECK (colour_hex IS NULL OR colour_hex ~ '^#[0-9A-Fa-f]{6}$'),
  notes text,
  attachment_path text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','in_review','accepted','customised','declined')),
  team_response text,
  alternative_title text,
  alternative_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_by_name text,
  responded_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_selections_project ON public.client_selections (project_id, created_at);
CREATE TRIGGER client_selections_updated BEFORE UPDATE ON public.client_selections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.client_selections IS
  'What the client proposes for their project (a showcase product, a colour, a reference picture, an idea) and how the design team answers it: accepted, customised with an alternative, or declined with a reason.';

CREATE OR REPLACE FUNCTION public.client_showcase_items()
RETURNS TABLE (id uuid, category text, name text, description text, unit text,
               image_url text, model_url text, swatch_hex text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, c.name, i.name, i.description, i.unit, i.image_url, i.model_url, i.swatch_hex
  FROM public.catalog_items i
  JOIN public.catalog_categories c ON c.id = i.category_id
  WHERE auth.uid() IS NOT NULL AND i.is_active AND i.client_showcase
  ORDER BY c.sort_order, c.name, i.name;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_name(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(trim(p.full_name), '') FROM public.profiles p WHERE p.id = _user_id;
$$;

-- A client's upload is always theirs, always restricted, and starts "received".
CREATE OR REPLACE FUNCTION public.prepare_drawing_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_client_user(auth.uid()) THEN
    NEW.uploaded_by := auth.uid();
    NEW.submitted_by_client := true;
    NEW.access_restricted := true;
    NEW.client_visible := false;
    NEW.review_status := 'received';
  ELSE
    NEW.submitted_by_client := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS drawings_prepare_insert ON public.drawings;
CREATE TRIGGER drawings_prepare_insert BEFORE INSERT ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_drawing_insert();

CREATE OR REPLACE FUNCTION public.log_drawing_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by_client THEN
      INSERT INTO public.document_activity (drawing_id, project_id, actor_id, actor_name, kind, status, body)
      VALUES (NEW.id, NEW.project_id, auth.uid(), public.profile_name(auth.uid()), 'received', 'received',
              'Received. A project lead will route it to the right specialists.');
    END IF;
  ELSIF NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IS NOT NULL THEN
    INSERT INTO public.document_activity (drawing_id, project_id, actor_id, actor_name, kind, status, client_visible)
    VALUES (NEW.id, NEW.project_id, auth.uid(), public.profile_name(auth.uid()), 'status', NEW.review_status,
            NEW.submitted_by_client OR NEW.client_visible);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS drawings_log_activity ON public.drawings;
CREATE TRIGGER drawings_log_activity AFTER INSERT OR UPDATE OF review_status ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.log_drawing_activity();

-- Clients cannot change anything on a document except through the policies
-- below (they have no UPDATE policy); internal seats cannot un-mark a client
-- submission as one.
CREATE OR REPLACE FUNCTION public.guard_drawing_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.submitted_by_client := OLD.submitted_by_client;
  NEW.uploaded_by := OLD.uploaded_by;
  IF NEW.access_restricted IS DISTINCT FROM OLD.access_restricted
     AND NOT public.is_project_lead(OLD.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only a project lead can change who may read this document.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS drawings_guard_update ON public.drawings;
CREATE TRIGGER drawings_guard_update BEFORE UPDATE ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.guard_drawing_update();

CREATE OR REPLACE FUNCTION public.prepare_document_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT d.project_id INTO NEW.project_id FROM public.drawings d WHERE d.id = NEW.drawing_id;
  IF TG_TABLE_NAME = 'document_activity' THEN
    NEW.actor_id := coalesce(auth.uid(), NEW.actor_id);
    NEW.actor_name := coalesce(public.profile_name(NEW.actor_id), NEW.actor_name);
  ELSE
    NEW.granted_by := coalesce(auth.uid(), NEW.granted_by);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_activity_prepare BEFORE INSERT ON public.document_activity
  FOR EACH ROW EXECUTE FUNCTION public.prepare_document_child();
CREATE TRIGGER document_access_grants_prepare BEFORE INSERT ON public.document_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.prepare_document_child();

CREATE OR REPLACE FUNCTION public.log_access_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.document_access_grants;
  who text;
BEGIN
  IF TG_OP = 'DELETE' THEN g := OLD; ELSE g := NEW; END IF;
  -- The document itself is being deleted (cascade): nothing left to log against.
  IF NOT EXISTS (SELECT 1 FROM public.drawings d WHERE d.id = g.drawing_id) THEN
    RETURN NULL;
  END IF;
  who := coalesce(g.grantee_role::text, public.profile_name(g.grantee_user_id), 'a team member');
  INSERT INTO public.document_activity (drawing_id, project_id, actor_id, actor_name, kind, body, client_visible)
  VALUES (g.drawing_id, g.project_id, auth.uid(), public.profile_name(auth.uid()),
          CASE WHEN TG_OP = 'DELETE' THEN 'access_revoked' ELSE 'access_granted' END,
          who, false);
  RETURN NULL;
END;
$$;
CREATE TRIGGER document_access_grants_log AFTER INSERT OR DELETE ON public.document_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.log_access_grant();

-- The design board: a client proposes, the team answers. Neither side can
-- write the other's half.
CREATE OR REPLACE FUNCTION public.guard_client_selection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_client boolean := public.is_client_user(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_by_name := public.profile_name(auth.uid());
    IF is_client THEN
      NEW.status := 'proposed';
      NEW.team_response := NULL;
      NEW.alternative_title := NULL;
      NEW.alternative_item_id := NULL;
      NEW.responded_by := NULL;
      NEW.responded_by_name := NULL;
      NEW.responded_at := NULL;
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
    NEW.project_id := OLD.project_id;
    IF is_client THEN
      IF OLD.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'You can only change your own proposals.';
      END IF;
      IF OLD.status <> 'proposed' THEN
        RAISE EXCEPTION 'The design team is already working on this proposal. Add a new one instead.';
      END IF;
      NEW.status := OLD.status;
      NEW.team_response := OLD.team_response;
      NEW.alternative_title := OLD.alternative_title;
      NEW.alternative_item_id := OLD.alternative_item_id;
      NEW.responded_by := OLD.responded_by;
      NEW.responded_by_name := OLD.responded_by_name;
      NEW.responded_at := OLD.responded_at;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.team_response IS DISTINCT FROM OLD.team_response
       OR NEW.alternative_title IS DISTINCT FROM OLD.alternative_title
       OR NEW.alternative_item_id IS DISTINCT FROM OLD.alternative_item_id THEN
      NEW.responded_by := auth.uid();
      NEW.responded_by_name := public.profile_name(auth.uid());
      NEW.responded_at := now();
    END IF;
  END IF;

  -- A client can only point at a product UZA chose to show them.
  IF is_client AND NEW.catalog_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items i
    WHERE i.id = NEW.catalog_item_id AND i.client_showcase AND i.is_active
  ) THEN
    RAISE EXCEPTION 'That product is not available to choose.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER client_selections_guard BEFORE INSERT OR UPDATE ON public.client_selections
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_selection();

-- ---------------------------------------------------------------------------
-- RLS: drawings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "team read drawings" ON public.drawings;
DROP POLICY IF EXISTS "team write drawings" ON public.drawings;
DROP POLICY IF EXISTS "Internal team reads all drawings" ON public.drawings;
DROP POLICY IF EXISTS "Clients read only released drawings" ON public.drawings;
DROP POLICY IF EXISTS "China sourcing reads drawings broadly" ON public.drawings;

CREATE POLICY "Read documents you are allowed to" ON public.drawings FOR SELECT TO authenticated
  USING (public.can_read_drawing(id, auth.uid()));
CREATE POLICY "China sourcing reads unrestricted drawings broadly" ON public.drawings FOR SELECT TO authenticated
  USING (NOT access_restricted AND NOT public.is_client_user(auth.uid())
         AND public.can_access_project_sourcing(project_id, auth.uid()));
CREATE POLICY "Project members upload documents" ON public.drawings FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team updates documents it can read" ON public.drawings FOR UPDATE TO authenticated
  USING (NOT public.is_client_user(auth.uid()) AND public.can_read_drawing(id, auth.uid()))
  WITH CHECK (NOT public.is_client_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Internal team deletes documents it can read" ON public.drawings FOR DELETE TO authenticated
  USING (NOT public.is_client_user(auth.uid()) AND public.can_read_drawing(id, auth.uid()));
CREATE POLICY "Clients withdraw their own unreviewed submissions" ON public.drawings FOR DELETE TO authenticated
  USING (public.is_client_user(auth.uid()) AND uploaded_by = auth.uid() AND review_status = 'received');

-- ---------------------------------------------------------------------------
-- RLS: grants, activity, selections
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON public.document_access_grants TO authenticated;
GRANT SELECT, INSERT ON public.document_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_selections TO authenticated;
GRANT ALL ON public.document_access_grants, public.document_activity, public.client_selections TO service_role;
ALTER TABLE public.document_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal team reads grants" ON public.document_access_grants FOR SELECT TO authenticated
  USING (NOT public.is_client_user(auth.uid()) AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Project leads grant access" ON public.document_access_grants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.drawings d
                      WHERE d.id = drawing_id AND public.is_project_lead(d.project_id, auth.uid())));
CREATE POLICY "Project leads revoke access" ON public.document_access_grants FOR DELETE TO authenticated
  USING (public.is_project_lead(project_id, auth.uid()));

CREATE POLICY "Read activity on documents you can read" ON public.document_activity FOR SELECT TO authenticated
  USING (public.can_read_drawing(drawing_id, auth.uid())
         AND (client_visible OR NOT public.is_client_user(auth.uid())));
CREATE POLICY "Post updates and comments on documents you can read" ON public.document_activity FOR INSERT TO authenticated
  WITH CHECK (
    public.can_read_drawing(drawing_id, auth.uid())
    AND (
      (NOT public.is_client_user(auth.uid()) AND kind IN ('update','comment'))
      OR (public.is_client_user(auth.uid()) AND kind = 'comment' AND client_visible)
    )
  );

CREATE POLICY "Project members read the design board" ON public.client_selections FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Project members add to the design board" ON public.client_selections FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Project members update the design board" ON public.client_selections FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "Remove own open proposals or as a lead" ON public.client_selections FOR DELETE TO authenticated
  USING ((created_by = auth.uid() AND status = 'proposed') OR public.is_project_lead(project_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: the other FOR ALL "team write" tables -- internal writes only
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['houses','floors','rooms','solar_proposals','solar_proposal_lines',
                           'training_records','project_speckle_projects','drawing_speckle_models']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "team write %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "internal insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "internal update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "internal delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()))', t);
  END LOOP;
END $$;
-- Training records hold the AI's raw draft and the human correction: internal.
DROP POLICY IF EXISTS "team read training_records" ON public.training_records;
CREATE POLICY "internal read training_records" ON public.training_records FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: files follow the record they belong to
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "team read drawings" ON storage.objects;
DROP POLICY IF EXISTS "team delete drawings" ON storage.objects;
CREATE POLICY "read project files you are allowed to" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'drawings' AND public.can_read_storage_object(name, auth.uid()));
CREATE POLICY "internal team deletes project files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'drawings' AND NOT public.is_client_user(auth.uid())
         AND public.can_access_project(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "clients delete their own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'drawings' AND public.is_client_user(auth.uid()) AND owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Function grants (anon never executes helpers)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_project_lead(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_drawing(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_storage_object(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.client_showcase_items() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.profile_name(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_project_lead(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_drawing(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_storage_object(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_showcase_items() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_name(uuid) TO authenticated, service_role;
