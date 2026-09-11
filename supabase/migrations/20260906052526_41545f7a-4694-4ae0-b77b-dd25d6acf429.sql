CREATE OR REPLACE FUNCTION public.stage_approvals_complete(_project_id uuid, _stage text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(public.stage_required_roles(_stage)) AS needed(role)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.approvals a
      WHERE a.project_id = _project_id
        AND a.stage = _stage
        AND a.role = needed.role
    )
  );
$$;

REVOKE ALL ON FUNCTION public.enforce_stage_sequence() FROM anon, authenticated, public;