-- 1. Exchange rates ---------------------------------------------------------
CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  source text NOT NULL,
  as_of date NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read exchange rates"
  ON public.fx_rates FOR SELECT TO authenticated USING (true);

CREATE INDEX fx_rates_pair_idx ON public.fx_rates (base_currency, quote_currency, fetched_at DESC);

-- 2. Stage sequencing -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_rank(_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _stage
    WHEN 'intake' THEN 1
    WHEN 'drawings' THEN 2
    WHEN 'site_survey' THEN 3
    WHEN 'concept' THEN 4
    WHEN 'takeoff' THEN 5
    WHEN 'boq' THEN 6
    WHEN 'review' THEN 7
    WHEN 'proposal' THEN 8
    WHEN 'procurement' THEN 9
    WHEN 'delivery' THEN 10
    WHEN 'handover' THEN 11
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.stage_required_roles(_stage text)
RETURNS app_role[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _stage
    WHEN 'intake' THEN ARRAY['project_manager']::app_role[]
    WHEN 'drawings' THEN ARRAY['architect']::app_role[]
    WHEN 'site_survey' THEN ARRAY['project_manager']::app_role[]
    WHEN 'concept' THEN ARRAY['interior_designer']::app_role[]
    WHEN 'takeoff' THEN ARRAY['qs']::app_role[]
    WHEN 'boq' THEN ARRAY['qs']::app_role[]
    WHEN 'review' THEN ARRAY['architect','mep_engineer','project_manager']::app_role[]
    WHEN 'proposal' THEN ARRAY['project_manager']::app_role[]
    WHEN 'procurement' THEN ARRAY['procurement']::app_role[]
    WHEN 'delivery' THEN ARRAY['project_manager']::app_role[]
    WHEN 'handover' THEN ARRAY['project_manager']::app_role[]
    ELSE ARRAY[]::app_role[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.stage_approvals_complete(_project_id uuid, _stage text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.stage_rank(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.stage_required_roles(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.stage_approvals_complete(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.stage_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_required_roles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_approvals_complete(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_stage_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_rank integer;
  new_rank integer;
  s text;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  old_rank := public.stage_rank(OLD.current_stage);
  new_rank := public.stage_rank(NEW.current_stage);

  IF new_rank = 0 THEN
    RAISE EXCEPTION 'Unknown project stage: %', NEW.current_stage;
  END IF;

  -- Moving back to an earlier stage is always allowed.
  IF new_rank < old_rank THEN
    RETURN NEW;
  END IF;

  IF new_rank > old_rank + 1 THEN
    RAISE EXCEPTION 'A project moves forward one stage at a time.';
  END IF;

  FOR s IN
    SELECT stage FROM (VALUES
      ('intake'),('drawings'),('site_survey'),('concept'),('takeoff'),
      ('boq'),('review'),('proposal'),('procurement'),('delivery'),('handover')
    ) AS t(stage)
    WHERE public.stage_rank(stage) < new_rank
  LOOP
    IF NOT public.stage_approvals_complete(NEW.id, s) THEN
      RAISE EXCEPTION 'Stage "%" still needs its sign-off before this project can move on.', s;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_stage_sequence
  BEFORE UPDATE OF current_stage ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_sequence();

-- 3. One sign-off per seat per stage ---------------------------------------
DELETE FROM public.approvals a
USING public.approvals b
WHERE a.ctid > b.ctid
  AND a.project_id = b.project_id
  AND a.stage = b.stage
  AND a.role = b.role;

CREATE UNIQUE INDEX approvals_project_stage_role_key
  ON public.approvals (project_id, stage, role);