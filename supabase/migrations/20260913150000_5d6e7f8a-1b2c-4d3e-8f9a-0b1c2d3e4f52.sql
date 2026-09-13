-- Confidentiality on raw uploaded files: "a person always decides, the
-- system enforces and records" -- NOT automated scrubbing.
--
-- Automated text-scrubbing of an arbitrary uploaded file (a scanned PDF
-- drawing, an image with an embedded logo/letterhead) is not reliable enough
-- to trust for a real confidentiality requirement -- a missed watermark or
-- logo image is a real business risk (a client could bypass UZA and deal
-- with the factory directly). This migration deliberately does NOT attempt
-- that. Instead: every document defaults to internal-only, and a human with
-- the right seat explicitly reviews and releases it, recorded.
--
-- (Compare `verifyNoForeignBranding()` in src/lib/confidentiality.ts, which
-- IS a reliable automated check -- but only for text this system generated
-- itself, like a proforma or a translated BOQ, where every string in the
-- output is under this app's control. A raw uploaded file is not.)
ALTER TABLE public.drawings
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_visible_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS client_visible_at timestamptz;
COMMENT ON COLUMN public.drawings.client_visible IS
  'Defaults to false (internal-only). A human (the project owner, china_sourcing, or admin -- never the uploader''s own automated say-so) reviews the actual file and explicitly releases it to the client. Never flipped by scanning file content: a missed watermark or embedded logo is a real confidentiality risk, so this is a decision, not a scan result.';

-- Before this fix, "team read drawings" (20260802153919) let ANY project
-- member read EVERY drawing regardless of role -- including a client seat,
-- with no client_visible concept at all. Verified by reading the policy, not
-- assumed: `USING (public.can_access_project(project_id, auth.uid()))`, no
-- is_client_user() exclusion anywhere. A client with direct API access
-- (bypassing the UI, which today simply never renders the Documents tab for
-- a cost-blind seat -- see projects_.$projectId.tsx's `isCostBlind` gate)
-- could already read every internal drawing on their project. RLS, not the
-- UI, is the layer this repo's own rules say must enforce this.
DROP POLICY IF EXISTS "team read drawings" ON public.drawings;
CREATE POLICY "Internal team reads all drawings" ON public.drawings FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));
CREATE POLICY "Clients read only released drawings" ON public.drawings FOR SELECT TO authenticated
  USING (
    public.can_access_project(project_id, auth.uid())
    AND public.is_client_user(auth.uid())
    AND client_visible
  );

-- Write access (upload/read-status updates/delete) is left exactly as it was
-- (can_access_project, unchanged "team write drawings") -- this migration is
-- scoped to the visibility flag and its audit trail, not a wider rework of
-- who may upload or remove a drawing; that a client seat can currently write
-- to this table at all is a separate, pre-existing question outside these
-- seven tasks and is called out in the report rather than silently changed.

-- The audit trail itself: who released it and when, stamped by the database,
-- never trusted from client input, and a client is blocked from ever
-- flipping their own visibility switch even if a future UI bug let them try.
CREATE OR REPLACE FUNCTION public.stamp_drawing_client_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_visible IS DISTINCT FROM OLD.client_visible THEN
    IF public.is_client_user(auth.uid()) THEN
      RAISE EXCEPTION 'A client cannot change a document''s visibility.';
    END IF;
    NEW.client_visible_by := auth.uid();
    NEW.client_visible_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS drawings_client_visibility_audit ON public.drawings;
CREATE TRIGGER drawings_client_visibility_audit BEFORE UPDATE ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_drawing_client_visibility();

-- Same automated-verification gate on proformas, since that IS
-- system-generated client-facing text: block issuing one that mentions a
-- known non-UZA name. Enforced in the trigger, not only in the UI, so a
-- direct write cannot skip it either. The actual name/matches logic mirrors
-- verifyNoForeignBranding() in src/lib/confidentiality.ts; this trigger
-- re-checks the same "is it a known supplier/manufacturer name" rule
-- directly against the suppliers table plus the fixed UZA-identity
-- allow-list, so the two never drift into checking different lists.
CREATE OR REPLACE FUNCTION public.block_foreign_branding_on_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hay text;
  bad text;
BEGIN
  IF NEW.status = 'issued' AND (OLD.status IS DISTINCT FROM 'issued') THEN
    SELECT lower(
      coalesce(NEW.title, '') || ' ' || coalesce(NEW.notes, '') || ' ' ||
      coalesce(string_agg(pl.description || ' ' || coalesce(pl.specification, '') || ' ' || coalesce(pl.description_source, ''), ' '), '')
    ) INTO hay
    FROM public.proforma_lines pl
    WHERE pl.proforma_id = NEW.id;

    SELECT s.name INTO bad
    FROM public.suppliers s
    WHERE hay LIKE '%' || lower(s.name) || '%'
    LIMIT 1;
    IF bad IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot issue this proforma: it mentions a non-UZA name ("%"). Run the confidentiality check and remove it first.', bad;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proformas_block_foreign_branding ON public.proformas;
CREATE TRIGGER proformas_block_foreign_branding BEFORE UPDATE ON public.proformas
  FOR EACH ROW EXECUTE FUNCTION public.block_foreign_branding_on_issue();
