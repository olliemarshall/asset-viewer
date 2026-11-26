begin;
-- Logical folders do not change immutable storage paths.
create table public.drawing_folders (
 id uuid primary key default gen_random_uuid(),
 scheme_id uuid not null references public.schemes(id) on delete restrict,
 parent_id uuid,
 name text not null check(char_length(trim(name)) between 1 and 120 and name=trim(name)),
 created_at timestamptz not null default now(),
 unique(id,scheme_id),
 foreign key(parent_id,scheme_id) references public.drawing_folders(id,scheme_id) on delete restrict,
 unique nulls not distinct(scheme_id,parent_id,name)
);
alter table public.drawings add constraint drawings_id_scheme_unique unique(id,scheme_id);
create table public.drawing_folder_locations (
 drawing_id uuid primary key,
 scheme_id uuid not null,
 folder_id uuid,
 foreign key(drawing_id,scheme_id) references public.drawings(id,scheme_id) on delete restrict,
 foreign key(folder_id,scheme_id) references public.drawing_folders(id,scheme_id) on delete restrict
);
create index drawing_folders_parent_idx on public.drawing_folders(scheme_id,parent_id);
create index drawing_folder_locations_folder_idx on public.drawing_folder_locations(scheme_id,folder_id);

-- A shared, revision-specific call-off draft. Not an approved asset register.
-- Explicit optimistic locking prevents stale normal clients overwriting newer edits.
create table public.drawing_calloff_sets (
 drawing_id uuid primary key references public.drawings(id) on delete restrict,
 payload jsonb not null check(jsonb_typeof(payload)='object'
   and payload ? 'records' and payload ? 'extracted'
   and jsonb_typeof(payload->'records')='object'
   and jsonb_typeof(payload->'extracted')='array'
   and octet_length(payload::text)<=2097152),
 version integer not null default 1 check(version>0),
 updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create function workspace_private.ready_drawing_access(did uuid,write_access boolean)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists(select 1 from public.drawings d where d.id=did and d.upload_status='ready' and workspace_private.drawing_scheme_access(d.scheme_id,write_access)); $$;
revoke all on function workspace_private.ready_drawing_access(uuid,boolean) from public,anon;
grant execute on function workspace_private.ready_drawing_access(uuid,boolean) to authenticated;
create function workspace_private.stamp_calloff_set()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'Invalid call-off version'; end if;
 new.updated_by=auth.uid();new.updated_at=now();return new;
end; $$;
revoke all on function workspace_private.stamp_calloff_set() from public,anon,authenticated;
create trigger calloff_set_stamp before insert or update on public.drawing_calloff_sets for each row execute function workspace_private.stamp_calloff_set();

alter table public.drawing_folders enable row level security;
alter table public.drawing_folder_locations enable row level security;
alter table public.drawing_calloff_sets enable row level security;
revoke all on public.drawing_folders,public.drawing_folder_locations,public.drawing_calloff_sets from public,anon,authenticated;
grant select on public.drawing_folders,public.drawing_folder_locations,public.drawing_calloff_sets to authenticated;
grant insert(scheme_id,parent_id,name),update(name) on public.drawing_folders to authenticated;
grant insert(drawing_id,scheme_id,folder_id),update(folder_id) on public.drawing_folder_locations to authenticated;
grant insert(drawing_id,payload),update(payload,version) on public.drawing_calloff_sets to authenticated;

create policy folders_read on public.drawing_folders for select to authenticated using(workspace_private.drawing_scheme_access(scheme_id,false));
create policy folders_insert on public.drawing_folders for insert to authenticated with check(workspace_private.drawing_scheme_access(scheme_id,true));
create policy folders_rename on public.drawing_folders for update to authenticated using(workspace_private.drawing_scheme_access(scheme_id,true)) with check(workspace_private.drawing_scheme_access(scheme_id,true));
create policy folder_locations_read on public.drawing_folder_locations for select to authenticated using(workspace_private.ready_drawing_access(drawing_id,false));
create policy folder_locations_insert on public.drawing_folder_locations for insert to authenticated with check(workspace_private.ready_drawing_access(drawing_id,true));
create policy folder_locations_move on public.drawing_folder_locations for update to authenticated using(workspace_private.ready_drawing_access(drawing_id,true)) with check(workspace_private.ready_drawing_access(drawing_id,true));
create policy calloff_sets_read on public.drawing_calloff_sets for select to authenticated using(workspace_private.ready_drawing_access(drawing_id,false));
create policy calloff_sets_insert on public.drawing_calloff_sets for insert to authenticated with check(workspace_private.ready_drawing_access(drawing_id,true));
create policy calloff_sets_update on public.drawing_calloff_sets for update to authenticated using(workspace_private.ready_drawing_access(drawing_id,true)) with check(workspace_private.ready_drawing_access(drawing_id,true));
commit;
