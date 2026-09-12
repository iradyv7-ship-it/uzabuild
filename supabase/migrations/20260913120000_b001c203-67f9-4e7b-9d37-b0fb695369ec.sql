-- Speckle rendering integration: a client-browsable 3D/BIM viewer with
-- comments, per UZA Build project.
--
-- Mapping (confirmed against Speckle's live GraphQL schema on
-- app.speckle.systems, 2026-09-13 — see src/lib/speckle.functions.ts for the
-- full provenance note): one Speckle *project* per UZA Build project, and one
-- Speckle *model* per uploaded drawing — so a client can browse the building
-- by drawing (e.g. one model per floor/zone) inside a single Speckle project.
CREATE TABLE public.project_speckle_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  speckle_server_url text NOT NULL DEFAULT 'https://app.speckle.systems',
  speckle_project_id text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER project_speckle_projects_updated BEFORE UPDATE ON public.project_speckle_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.drawing_speckle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL UNIQUE REFERENCES public.drawings(id) ON DELETE CASCADE,
  speckle_model_id text NOT NULL,
  speckle_model_name text NOT NULL,
  -- Set by fileUploadMutations.generateUploadUrl, consumed by startFileIngestion.
  latest_file_id text,
  -- The id of the in-flight/most recent ModelIngestion job, and the terminal
  -- state we last observed for it. A version only exists once this reaches
  -- 'success' — never infer a version from latest_file_id alone.
  latest_ingestion_id text,
  ingestion_status text NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'success', 'error')),
  ingestion_error text,
  latest_version_id text,
  -- Best-effort iframe src we compose from server/project/model ids (see
  -- speckleEmbedUrl in speckle.functions.ts). Speckle's own "copy embed code"
  -- action in its web app produces the authoritative query string with
  -- viewer-chrome options; a human can paste that here to override our guess.
  embed_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER drawing_speckle_models_updated BEFORE UPDATE ON public.drawing_speckle_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_speckle_projects', 'drawing_speckle_models']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "team read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "team write %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()))', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.project_speckle_projects IS
  'One row per UZA Build project that has been linked to a Speckle (speckle.systems) project for 3D/BIM rendering. speckle_project_id is the id Speckle returned from projectMutations.create.';
COMMENT ON TABLE public.drawing_speckle_models IS
  'One row per uploaded drawing that has been sent to Speckle as its own model, so a client can browse a building by floor/zone. ingestion_status tracks Speckle''s async file-conversion job (fileUploadMutations.generateUploadUrl -> PUT bytes -> startFileIngestion -> poll ModelIngestion.statusData); latest_version_id is only meaningful once ingestion_status = ''success''.';
