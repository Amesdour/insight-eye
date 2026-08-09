
CREATE POLICY "tenant_files_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('footage','snapshots')
  AND ((storage.foldername(name))[1] = public.current_tenant_id()::text OR public.is_super_admin()));

CREATE POLICY "tenant_files_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('footage','snapshots')
  AND (storage.foldername(name))[1] = public.current_tenant_id()::text);

CREATE POLICY "tenant_files_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('footage','snapshots')
  AND ((storage.foldername(name))[1] = public.current_tenant_id()::text OR public.is_super_admin()));
