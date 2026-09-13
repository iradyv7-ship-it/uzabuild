-- Cecilia's "high right": china_sourcing gets sourcing-relevant visibility
-- across every ACTIVE project, not gated one invitation at a time.
--
-- WHAT WAS TRUE BEFORE THIS MIGRATION (verified by reading the RLS, not
-- assumed): `procurement` had NO broader project reach than any other seat.
-- Every sourcing table (proformas, product_packages and its requirements /
-- attachments / manufacturer shortlist, boq_versions, boq_lines) is gated by
-- `can_access_project()`, which is true only for a project's owner, an
-- explicit `project_members` row, or `admin` (see 20260802153919's
-- `can_access_project` and 20260902110504's `can_manage_catalog`, the only
-- two places 'procurement' appears in any RLS check). So "match procurement"
-- was already satisfied by china_sourcing's existing seat -- the founder's
-- actual ask goes further than procurement's current reach: broad,
-- project-unscoped visibility for sourcing data specifically, the way admin
-- already has it.
--
-- `clients` (name, contact, TIN, billing email, phone) was and remains
-- visible to EVERY internal role via `is_internal_user()`, project-unscoped,
-- since 20260902110504 -- this migration does not touch that table and does
-- not widen client PII exposure at all, per the founder's explicit limit.
--
-- WHAT THIS MIGRATION DOES: a new helper, used ONLY on the sourcing tables
-- named above, granting china_sourcing (and admin, who already had it) read
-- access to that data for every project whose status is not 'completed' --
-- without requiring a `project_members` row first. It is deliberately NOT
-- folded into `can_access_project` itself, which stays the gate for
-- everything else a project membership implies (houses, rooms, elements,
-- approvals, deliveries, coordination threads, requisitions, purchase
-- orders, discovery answers, proposals) -- china_sourcing does not get
-- admin-equivalent reach into those. WRITE access to the sourcing tables is
-- also left untouched (still `can_access_project`-gated): this migration is
-- about her being able to see what needs her attention across every active
-- project, not about her being able to edit a project she was never put on.

CREATE OR REPLACE FUNCTION public.has_broad_sourcing_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'china_sourcing');
$$;
REVOKE EXECUTE ON FUNCTION public.has_broad_sourcing_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_broad_sourcing_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_project_sourcing(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_project(_project_id, _user_id)
      OR (
        public.has_broad_sourcing_access(_user_id)
        AND EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = _project_id AND p.status IS DISTINCT FROM 'completed'
        )
      );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_project_sourcing(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_access_project_sourcing(uuid, uuid) TO authenticated, service_role;

-- Additive SELECT-only policies. Postgres OR's every policy that matches a
-- command together, so these only ever widen who can read a row -- the
-- existing write/manage policies (still can_access_project-scoped) are
-- untouched.
CREATE POLICY "China sourcing reads boq versions broadly" ON public.boq_versions FOR SELECT TO authenticated
  USING (public.can_access_project_sourcing(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "China sourcing reads boq lines broadly" ON public.boq_lines FOR SELECT TO authenticated
  USING (public.can_access_project_sourcing(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "China sourcing reads packages broadly" ON public.product_packages FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));

CREATE POLICY "China sourcing reads package requirements broadly" ON public.package_requirements FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));

CREATE POLICY "China sourcing reads package attachments broadly" ON public.package_attachments FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));

CREATE POLICY "China sourcing reads package manufacturers broadly" ON public.package_manufacturers FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()) AND public.can_access_project_sourcing(project_id, auth.uid()));

CREATE POLICY "China sourcing reads proformas broadly" ON public.proformas FOR SELECT TO authenticated
  USING (public.can_access_project_sourcing(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

CREATE POLICY "China sourcing reads proforma lines broadly" ON public.proforma_lines FOR SELECT TO authenticated
  USING (public.can_access_project_sourcing(project_id, auth.uid()) AND NOT public.is_client_user(auth.uid()));

-- Drawings/documents: broad READ only (task 3's "documents recently uploaded
-- she hasn't yet acknowledged" needs this across active projects she is not
-- yet a member of); write stays can_access_project-gated as before.
CREATE POLICY "China sourcing reads drawings broadly" ON public.drawings FOR SELECT TO authenticated
  USING (public.can_access_project_sourcing(project_id, auth.uid()));
