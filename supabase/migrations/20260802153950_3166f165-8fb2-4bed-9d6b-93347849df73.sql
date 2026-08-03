CREATE POLICY "team read drawings" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'drawings' AND public.can_access_project(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "team upload drawings" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'drawings' AND public.can_access_project(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "team delete drawings" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'drawings' AND public.can_access_project(((storage.foldername(name))[1])::uuid, auth.uid()));