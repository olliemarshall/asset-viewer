-- Development migration: shared project/scheme records only.
-- Run once in a new development database. No demo or confidential data inserted.
begin;
create schema if not exists workspace_private;
revoke all on schema workspace_private from public;
grant usage on schema workspace_private to authenticated;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  primary key (organisation_id,user_id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 200),
  reference text not null check (char_length(trim(reference)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  unique(organisation_id,reference)
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  primary key (project_id,user_id)
);
create table public.schemes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 200),
  reference text not null check (char_length(trim(reference)) between 1 and 100),
  location text not null default '' check (char_length(location) <= 200),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  unique(project_id,reference)
);
create index organisation_members_user_idx on public.organisation_members(user_id);
create index project_members_user_idx on public.project_members(user_id);
create index projects_organisation_idx on public.projects(organisation_id);
create index schemes_project_idx on public.schemes(project_id);

-- Definer functions avoid recursive RLS. No caller-supplied user IDs.
create function workspace_private.org_member(oid uuid, admin_only boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.organisation_members m where m.organisation_id=oid and m.user_id=(select auth.uid()) and (not admin_only or m.role='admin')); $$;
create function workspace_private.project_access(pid uuid, write_access boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.projects p where p.id=pid and (
  workspace_private.org_member(p.organisation_id,true) or
  (workspace_private.org_member(p.organisation_id,false) and exists(
    select 1 from public.project_members m where m.project_id=p.id and m.user_id=(select auth.uid())
    and (not write_access or m.role='editor')
  ))
)); $$;
revoke all on function workspace_private.org_member(uuid,boolean) from public;
revoke all on function workspace_private.project_access(uuid,boolean) from public;
grant execute on function workspace_private.org_member(uuid,boolean), workspace_private.project_access(uuid,boolean) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.schemes enable row level security;
revoke all on public.organisations, public.organisation_members, public.projects, public.project_members, public.schemes from anon, authenticated;
grant select on public.organisations, public.organisation_members, public.projects, public.project_members, public.schemes to authenticated;
grant insert (organisation_id,name,reference,description) on public.projects to authenticated;
grant update (name,reference,description,status) on public.projects to authenticated;
grant insert (project_id,name,reference,location,description) on public.schemes to authenticated;
grant update (name,reference,location,description,status) on public.schemes to authenticated;

create policy org_read on public.organisations for select to authenticated using (workspace_private.org_member(id,false));
create policy org_members_read on public.organisation_members for select to authenticated using (user_id=(select auth.uid()) or workspace_private.org_member(organisation_id,true));
create policy project_read on public.projects for select to authenticated using (workspace_private.project_access(id,false));
create policy project_insert on public.projects for insert to authenticated with check (workspace_private.org_member(organisation_id,true));
create policy project_update on public.projects for update to authenticated using (workspace_private.org_member(organisation_id,true)) with check (workspace_private.org_member(organisation_id,true));
create policy project_members_read on public.project_members for select to authenticated using (workspace_private.project_access(project_id,false));
create policy scheme_read on public.schemes for select to authenticated using (workspace_private.project_access(project_id,false));
create policy scheme_insert on public.schemes for insert to authenticated with check (workspace_private.project_access(project_id,true));
create policy scheme_update on public.schemes for update to authenticated using (workspace_private.project_access(project_id,true)) with check (workspace_private.project_access(project_id,true));

-- Create an organisation and its initial administrator atomically.
create function public.create_workspace_organisation(org_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare oid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.organisations(name) values (trim(org_name)) returning id into oid;
  insert into public.organisation_members(organisation_id,user_id,role) values (oid,uid,'admin');
  return oid;
end;
$$;
revoke all on function public.create_workspace_organisation(text) from public, anon;
grant execute on function public.create_workspace_organisation(text) to authenticated;
commit;
