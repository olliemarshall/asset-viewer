begin;
-- Storage read policies consult attachment metadata, so checking an object
-- directly inside the attachment update policy creates an RLS recursion.
-- This narrow helper avoids the cycle and independently checks the caller.
create function workspace_private.assurance_attachment_object_exists(rid uuid, aid uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
 select 1 from public.assurance_attachments a join public.assurance_records r on r.id=a.record_id join public.projects p on p.id=r.project_id
 where a.id=aid and a.record_id=rid and a.kind='file' and a.created_by=auth.uid() and p.status='active'
 and workspace_private.project_access(p.id,true)
 and exists(select 1 from storage.objects o where o.bucket_id='assurance-attachments' and o.name=a.storage_path)
); $$;
revoke all on function workspace_private.assurance_attachment_object_exists(uuid,uuid) from public,anon;
grant execute on function workspace_private.assurance_attachment_object_exists(uuid,uuid) to authenticated;
alter policy assurance_attachment_finalize on public.assurance_attachments with check (
 kind='file' and upload_status='ready' and created_by=(select auth.uid())
 and exists(select 1 from public.assurance_records r join public.projects p on p.id=r.project_id where r.id=record_id and p.status='active' and workspace_private.project_access(p.id,true))
 and workspace_private.assurance_attachment_object_exists(record_id,id)
);
commit;