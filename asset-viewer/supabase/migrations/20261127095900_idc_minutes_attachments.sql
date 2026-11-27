begin;
alter table public.assurance_records drop constraint assurance_records_status_check;
alter table public.assurance_records add constraint assurance_records_status_check check (
 status in ('draft','open','in_review','closed','withdrawn') or (kind='idc' and status in ('note','deferred'))
);

create table public.assurance_attachments (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.assurance_records(id) on delete restrict,
 title text not null check(char_length(trim(title)) between 1 and 250),
 kind text not null check(kind in ('file','link')),
 url text,
 filename text,
 mime_type text,
 byte_size bigint,
 fingerprint text,
 upload_status text not null default 'pending' check(upload_status in ('pending','ready')),
 storage_path text generated always as (record_id::text||'/'||id::text) stored,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 check ((kind='link' and upload_status='ready' and url is not null and url ~ '^https://[^[:space:]]+$' and char_length(url)<=4000 and filename is null and mime_type is null and byte_size is null and fingerprint is null)
 or (kind='file' and url is null and filename is not null and char_length(filename) between 1 and 255 and mime_type is not null and mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','text/plain') and byte_size is not null and byte_size between 1 and 26214400 and fingerprint is not null and fingerprint ~ '^[0-9a-f]{64}$'))
);
create index assurance_attachments_record_idx on public.assurance_attachments(record_id);
alter table public.assurance_attachments enable row level security;
revoke all on public.assurance_attachments from public,anon,authenticated;
grant select on public.assurance_attachments to authenticated;
grant insert(record_id,title,kind,url,filename,mime_type,byte_size,fingerprint,upload_status),update(upload_status) on public.assurance_attachments to authenticated;
create policy assurance_attachment_read on public.assurance_attachments for select to authenticated using (
 exists(select 1 from public.assurance_records r where r.id=record_id and r.kind in ('tq','rfi','variation','appointment') and workspace_private.project_access(r.project_id,false))
 and (upload_status='ready' or created_by=(select auth.uid()))
);
create policy assurance_attachment_insert on public.assurance_attachments for insert to authenticated with check (
 created_by=(select auth.uid()) and ((kind='file' and upload_status='pending') or (kind='link' and upload_status='ready'))
 and exists(select 1 from public.assurance_records r join public.projects p on p.id=r.project_id where r.id=record_id and r.kind in ('tq','rfi','variation','appointment') and p.status='active' and workspace_private.project_access(p.id,true))
);
create policy assurance_attachment_finalize on public.assurance_attachments for update to authenticated using (
 kind='file' and upload_status='pending' and created_by=(select auth.uid())
 and exists(select 1 from public.assurance_records r join public.projects p on p.id=r.project_id where r.id=record_id and p.status='active' and workspace_private.project_access(p.id,true))
) with check (
 kind='file' and upload_status='ready' and created_by=(select auth.uid())
 and exists(select 1 from public.assurance_records r join public.projects p on p.id=r.project_id where r.id=record_id and p.status='active' and workspace_private.project_access(p.id,true))
 and exists(select 1 from storage.objects o where o.bucket_id='assurance-attachments' and o.name=storage_path)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('assurance-attachments','assurance-attachments',false,26214400,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','text/plain']);
create policy assurance_attachment_upload on storage.objects for insert to authenticated with check (
 bucket_id='assurance-attachments' and exists(
 select 1 from public.assurance_attachments a join public.assurance_records r on r.id=a.record_id join public.projects p on p.id=r.project_id
 where a.storage_path=objects.name and a.kind='file' and a.upload_status='pending' and a.created_by=(select auth.uid()) and p.status='active' and workspace_private.project_access(p.id,true))
);
create policy assurance_attachment_download on storage.objects for select to authenticated using (
 bucket_id='assurance-attachments' and exists(
 select 1 from public.assurance_attachments a where a.storage_path=objects.name and a.kind='file')
);
commit;