DROP POLICY "price history insert" ON public.catalog_price_history;
CREATE POLICY "price history insert" ON public.catalog_price_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_price_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon;