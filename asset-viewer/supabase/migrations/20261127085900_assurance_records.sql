begin;
create table public.assurance_records(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 kind text not null check(kind in ('tq','rfi','variation','idr','idc','deliverable','appointment','hazard','change','ecc','ecmp')),
 reference text not null check(char_length(trim(reference)) between 1 and 100),
 title text not null check(char_length(trim(title)) between 1 and 250),
 status text not null default 'draft' check(status in ('draft','open','in_review','closed','withdrawn')),
 owner text not null default '' check(char_length(owner)<=200),
 due_date date,
 details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<=131072),
 version integer not null default 1 check(version>0),
 updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(project_id,kind,reference)
);
create index assurance_records_project_idx on public.assurance_records(project_id,kind);
alter table public.assurance_records enable row level security;
revoke all on public.assurance_records from public,anon,authenticated;
grant select on public.assurance_records to authenticated;
grant insert(project_id,kind,reference,title,status,owner,due_date,details),update(reference,title,status,owner,due_date,details,version) on public.assurance_records to authenticated;
create policy assurance_read on public.assurance_records for select to authenticated using(workspace_private.project_access(project_id,false));
create policy assurance_insert on public.assurance_records for insert to authenticated with check(workspace_private.project_access(project_id,true) and exists(select 1 from public.projects p where p.id=project_id and p.status='active'));
create policy assurance_update on public.assurance_records for update to authenticated using(workspace_private.project_access(project_id,true) and exists(select 1 from public.projects p where p.id=project_id and p.status='active')) with check(workspace_private.project_access(project_id,true) and exists(select 1 from public.projects p where p.id=project_id and p.status='active'));
-- Reuse the version and attribution trigger: updates must advance exactly once.
create trigger assurance_stamp before insert or update on public.assurance_records for each row execute function workspace_private.stamp_calloff_set();

create table public.assurance_templates(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 name text not null check(char_length(trim(name)) between 1 and 200),
 kind text not null check(kind in ('tq','rfi','variation','idr','idc','deliverable','appointment','hazard','change','ecc','ecmp')),
 body text not null check(char_length(body) between 1 and 60000),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(project_id,kind,name)
);
alter table public.assurance_templates enable row level security;
revoke all on public.assurance_templates from public,anon,authenticated;
grant select on public.assurance_templates to authenticated;
grant insert(project_id,name,kind,body) on public.assurance_templates to authenticated;
create policy assurance_template_read on public.assurance_templates for select to authenticated using(workspace_private.project_access(project_id,false));
create policy assurance_template_insert on public.assurance_templates for insert to authenticated with check(workspace_private.project_access(project_id,true) and exists(select 1 from public.projects p where p.id=project_id and p.status='active'));
commit;
