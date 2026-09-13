-- Manufacturer confidentiality wall.
--
-- A manufacturer is neither UZA staff nor a client: it must see and respond
-- to (upload quotes/drawings/specs against) only the specific package(s) it
-- was invited to, and never: the client's identity, the client-facing USD
-- price/proforma, any other manufacturer's data, or any project data outside
-- its own scope. Mirrors the pattern proven in uza-mobility-bn's
-- lender-access.ts ("a lender sees only its own borrowers, identical-404 for
-- anything outside scope, never a filtered-but-visible list") -- adapted to
-- this repo's RLS convention: deny by scope means the ROW SIMPLY IS NOT
-- RETURNED, not a filtered list and not a distinguishable error. See
-- src/lib/manufacturer-access.ts for the equivalent pure access-check logic
-- and its tests (RLS itself is not unit-testable in this repo's setup).
--
-- ============================================================
-- 1. THE CRITICAL FIX: is_internal_user() must NOT include 'manufacturer'.
-- ============================================================
-- Before this change, is_internal_user() was "has any role other than
-- exactly 'client'" -- so a manufacturer account (role <> 'client') would
-- have satisfied it, and every is_internal_user()-gated policy is
-- project-UNSCOPED: "Internal users read clients" (full client PII: name,
-- contact, TIN, billing email, phone -- see 20260902110504), "Internal users
-- read catalog items/categories/price history", "internal users read
-- supplier coverage". A manufacturer account would have been able to read
-- every client's identity and the whole cost catalog the moment it existed,
-- regardless of which package it was invited to. This is the single most
-- important line in this migration.
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role NOT IN ('client', 'manufacturer')
  );
$$;

-- ============================================================
-- 2. Which supplier (factory) a manufacturer account represents.
-- ============================================================
CREATE TABLE public.manufacturer_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manufacturer_users TO authenticated;
GRANT ALL ON public.manufacturer_users TO service_role;
ALTER TABLE public.manufacturer_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "A manufacturer reads its own account link" ON public.manufacturer_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_broad_sourcing_access(auth.uid()));
CREATE POLICY "China sourcing and admin manage manufacturer accounts" ON public.manufacturer_users
  FOR ALL TO authenticated
  USING (public.has_broad_sourcing_access(auth.uid()))
  WITH CHECK (public.has_broad_sourcing_access(auth.uid()));

-- ============================================================
-- 3. Which package(s) a manufacturer is walled to.
-- ============================================================
-- package_manufacturers (package_id, project_id, supplier_id, status) IS the
-- RFQ/shortlist record already -- no new table needed for "invited to". A
-- manufacturer is in scope for a package iff its supplier_id has a row there.
CREATE OR REPLACE FUNCTION public.is_invited_manufacturer(_package_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manufacturer_users mu
    JOIN public.package_manufacturers pm ON pm.supplier_id = mu.supplier_id
    WHERE mu.user_id = _user_id AND pm.package_id = _package_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_invited_manufacturer(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_invited_manufacturer(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manufacturer_supplier_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT supplier_id FROM public.manufacturer_users WHERE user_id = _user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.manufacturer_supplier_id(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.manufacturer_supplier_id(uuid) TO authenticated, service_role;

-- A manufacturer may see the package it was invited to (title, scope,
-- category, spec notes -- what it needs to quote) and the shortlist row that
-- names it, but never another package, never the client record, never a
-- proforma or its USD price (those tables carry no manufacturer-facing
-- policy at all -- absence of a grant IS the wall, same as "identical-404"
-- in the Nest guard: a manufacturer querying them gets zero rows, not a
-- distinguishable error).
CREATE POLICY "Manufacturer reads its own invited package" ON public.product_packages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manufacturer') AND public.is_invited_manufacturer(id, auth.uid()));

CREATE POLICY "Manufacturer reads its own package requirements" ON public.package_requirements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manufacturer') AND public.is_invited_manufacturer(package_id, auth.uid()));

CREATE POLICY "Manufacturer reads its own shortlist row" ON public.package_manufacturers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manufacturer')
    AND supplier_id = public.manufacturer_supplier_id(auth.uid())
  );

-- package_attachments: a manufacturer may read general RFQ documents UZA
-- addressed to the package (uploaded_for_supplier_id IS NULL) plus its OWN
-- submissions, but never a rival manufacturer's quote/drawing on the same
-- package -- that is the "no other manufacturer's data" rule in practice.
ALTER TABLE public.package_attachments
  ADD COLUMN IF NOT EXISTS uploaded_for_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.package_attachments.uploaded_for_supplier_id IS
  'NULL = a general RFQ document (drawing/spec) UZA addressed to every invited manufacturer on this package. Set = one manufacturer''s own private submission (its quote/drawing/spec), visible to UZA staff and that manufacturer only, never a competing manufacturer on the same package.';

CREATE POLICY "Manufacturer reads RFQ docs and its own submissions" ON public.package_attachments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manufacturer')
    AND public.is_invited_manufacturer(package_id, auth.uid())
    AND (
      uploaded_for_supplier_id IS NULL
      OR uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    )
  );

CREATE POLICY "Manufacturer uploads its own quote/drawing/spec" ON public.package_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manufacturer')
    AND public.is_invited_manufacturer(package_id, auth.uid())
    AND uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Manufacturer manages its own submissions" ON public.package_attachments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manufacturer')
    AND uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND uploaded_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manufacturer')
    AND uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Manufacturer deletes its own submissions" ON public.package_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manufacturer')
    AND uploaded_for_supplier_id = public.manufacturer_supplier_id(auth.uid())
    AND uploaded_by = auth.uid()
  );

-- Explicitly NOT granted to 'manufacturer' by any policy anywhere, so RLS's
-- default-deny leaves these unreachable (the "identical-404" -- zero rows,
-- no distinguishable error): clients, proformas, proforma_lines, drawings,
-- boq_versions, boq_lines, requisitions, rfqs, purchase_orders, deliveries,
-- coordination_threads (unless explicitly added as a thread_participant by
-- name -- that mechanism already exists and is per-thread, not per-role),
-- catalog_items, suppliers (the directory row for OTHER factories).
