-- Private, immutable drawing revisions. Only authorised project members may read.
begin;
create table public.drawings (
 id uuid primary key default gen_random_uuid(),
 scheme_id uuid not null references public.schemes(id) on delete restrict,
 title text not null check (char_length(trim(title)) between 1 and 200),
 reference text not null check (char_length(trim(reference)) between 1 and 100),
 revision text not null check (char_length(trim(revision)) between 1 and 40),
 discipline text not null check (discipline in ('Unassigned','Signalling','Track','E&P','Civils','Telecoms','Other')),
 description text not null default '' check (char_length(description)<=4000),
 filename text not null check (char_length(filename) between 1 and 255),
 byte_size bigint not null check (byte_size between 5 and 26214400),
 fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
 uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 upload_status text not null default 'pending' check (upload_status in ('pending','ready')),
 storage_path text generated always as (scheme_id::text || '/' || id::text || '.pdf') stored,
 unique(scheme_id,reference,revision)
);
create index drawings_scheme_idx on public.drawings(scheme_id);
create index drawings_uploader_idx on public.drawings(uploaded_by);
alter table public.drawings enable row level security;
revoke all on public.drawings from public,anon,authenticated;
grant select on public.drawings to authenticated;
grant insert (scheme_id,title,reference,revision,discipline,description,filename,byte_size,fingerprint) on public.drawings to authenticated;
grant update (upload_status) on public.drawings to authenticated;

-- Evaluate permissions on the scheme, not the newly inserted drawing itself.
create function workspace_private.drawing_scheme_access(sid uuid,write_access boolean)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists (
 select 1 from public.schemes s join public.projects p on p.id=s.project_id
 where s.id=sid and workspace_private.project_access(p.id,write_access)
 and (not write_access or (s.status='active' and p.status='active'))
); $$;
revoke all on function workspace_private.drawing_scheme_access(uuid,boolean) from public,anon;
grant execute on function workspace_private.drawing_scheme_access(uuid,boolean) to authenticated;

-- The uploader may finalise only after the expected storage object exists.
-- Private schema helper avoids cross-table RLS recursion; scheme membership
-- is checked again, and object path must correspond to the supplied scheme.
create function workspace_private.drawing_object_exists(sid uuid,did uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select workspace_private.drawing_scheme_access(sid,true) and exists (
 select 1 from storage.objects o where o.bucket_id='scheme-drawings' and o.name=sid::text||'/'||did::text||'.pdf'
); $$;
revoke all on function workspace_private.drawing_object_exists(uuid,uuid) from public,anon;
grant execute on function workspace_private.drawing_object_exists(uuid,uuid) to authenticated;

create policy drawing_read on public.drawings for select to authenticated using (
 workspace_private.drawing_scheme_access(scheme_id,false) and
 (upload_status='ready' or uploaded_by=(select auth.uid()))
);
create policy drawing_insert on public.drawings for insert to authenticated with check (
 workspace_private.drawing_scheme_access(scheme_id,true) and uploaded_by=(select auth.uid()) and upload_status='pending'
);
create policy drawing_finalize on public.drawings for update to authenticated using (
 workspace_private.drawing_scheme_access(scheme_id,true) and uploaded_by=(select auth.uid()) and upload_status='pending'
) with check (
 workspace_private.drawing_scheme_access(scheme_id,true) and uploaded_by=(select auth.uid()) and upload_status='ready'
 and workspace_private.drawing_object_exists(scheme_id,id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scheme-drawings','scheme-drawings',false,26214400,array['application/pdf']);
-- No anonymous access, object replacement or deletion from this client.
create policy scheme_drawing_upload on storage.objects for insert to authenticated with check (
 bucket_id='scheme-drawings' and exists (
 select 1 from public.drawings d where d.storage_path=name and d.upload_status='pending'
 and d.uploaded_by=(select auth.uid()) and workspace_private.drawing_scheme_access(d.scheme_id,true)
 )
);
create policy scheme_drawing_download on storage.objects for select to authenticated using (
 bucket_id='scheme-drawings' and exists (
 select 1 from public.drawings d where d.storage_path=name and workspace_private.drawing_scheme_access(d.scheme_id,false)
 and (d.upload_status='ready' or d.uploaded_by=(select auth.uid()))
 )
);
commit;
