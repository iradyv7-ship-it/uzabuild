-- 1. Project reference numbers ------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.project_code_seq;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;

CREATE OR REPLACE FUNCTION public.assign_project_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_code IS NULL OR NEW.project_code = '' THEN
    NEW.project_code := 'UZA-P-' || to_char(now() AT TIME ZONE 'Africa/Kigali', 'YY')
      || '-' || lpad(nextval('public.project_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_assign_code ON public.projects;
CREATE TRIGGER projects_assign_code
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.assign_project_code();

UPDATE public.projects p
SET project_code = 'UZA-P-' || to_char(p.created_at AT TIME ZONE 'Africa/Kigali', 'YY')
  || '-' || lpad(nextval('public.project_code_seq')::text, 4, '0')
WHERE p.project_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_project_code_key ON public.projects (project_code);

-- 2. BOQ version reference ------------------------------------------------------
ALTER TABLE public.boq_versions ADD COLUMN IF NOT EXISTS reference text;

CREATE OR REPLACE FUNCTION public.assign_boq_version_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT project_code INTO code FROM public.projects WHERE id = NEW.project_id;
    NEW.reference := coalesce(code, 'UZA-P-????') || '/BOQ-V' || lpad(NEW.version_no::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boq_versions_assign_reference ON public.boq_versions;
CREATE TRIGGER boq_versions_assign_reference
BEFORE INSERT ON public.boq_versions
FOR EACH ROW EXECUTE FUNCTION public.assign_boq_version_reference();

UPDATE public.boq_versions v
SET reference = coalesce(p.project_code, 'UZA-P-????') || '/BOQ-V' || lpad(v.version_no::text, 2, '0')
FROM public.projects p
WHERE p.id = v.project_id AND v.reference IS NULL;

-- 3. Project status derived from the stage --------------------------------------
CREATE OR REPLACE FUNCTION public.status_for_stage(_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _stage IN ('intake','drawings','site_survey','concept','takeoff','boq') THEN 'in_progress'
    WHEN _stage = 'review' THEN 'awaiting_signoff'
    WHEN _stage IN ('proposal','procurement') THEN 'approved'
    WHEN _stage = 'delivery' THEN 'delivering'
    WHEN _stage = 'handover' THEN 'completed'
    ELSE 'in_progress'
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_project_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status := public.status_for_stage(NEW.current_stage);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_sync_status ON public.projects;
CREATE TRIGGER projects_sync_status
BEFORE INSERT OR UPDATE OF current_stage ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.sync_project_status();

UPDATE public.projects SET status = public.status_for_stage(current_stage);

-- 4. One-to-one discussions -----------------------------------------------------
ALTER TABLE public.coordination_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'group';

ALTER TABLE public.coordination_threads
  DROP CONSTRAINT IF EXISTS coordination_threads_thread_type_check;
ALTER TABLE public.coordination_threads
  ADD CONSTRAINT coordination_threads_thread_type_check
  CHECK (thread_type IN ('group', 'direct'));

CREATE INDEX IF NOT EXISTS coordination_threads_project_type_idx
  ON public.coordination_threads (project_id, thread_type);

REVOKE ALL ON FUNCTION public.assign_project_code() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_boq_version_reference() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_project_status() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.status_for_stage(text) TO authenticated;