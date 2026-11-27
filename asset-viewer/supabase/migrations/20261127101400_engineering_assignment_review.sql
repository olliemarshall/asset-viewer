begin;
-- Project-specific engineering designations are administrative labels, not competence appointments.
create table public.project_engineers(
 project_id uuid not null references public.projects(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 display_name text not null check(char_length(trim(display_name)) between 1 and 200),
 designation text not null check(designation in ('CRE','CEM','Engineer')),
 can_review boolean not null default false,
 active boolean not null default true,
 primary key(project_id,user_id)
);
alter table public.project_engineers enable row level security;
revoke all on public.project_engineers from public,anon,authenticated;
grant select on public.project_engineers to authenticated;
create policy project_engineer_read on public.project_engineers for select to authenticated using(workspace_private.project_access(project_id,false));

create table public.assurance_assignments(
 record_id uuid primary key references public.assurance_records(id) on delete restrict,
 assignee_id uuid not null references auth.users(id) on delete restrict,
 assigned_by uuid not null references auth.users(id) on delete restrict,
 assigned_at timestamptz not null default now()
);
create table public.assurance_reviews(
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.assurance_records(id) on delete restrict,
 record_version integer not null check(record_version>0),
 reviewer_id uuid not null references auth.users(id) on delete restrict,
 requested_by uuid not null references auth.users(id) on delete restrict,
 requested_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','changes_requested')),
 request_note text not null default '' check(char_length(request_note)<=4000),
 decision_note text not null default '' check(char_length(decision_note)<=4000),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete restrict,
 unique(record_id,record_version)
);
alter table public.assurance_assignments enable row level security;
alter table public.assurance_reviews enable row level security;
revoke all on public.assurance_assignments,public.assurance_reviews from public,anon,authenticated;
grant select on public.assurance_assignments,public.assurance_reviews to authenticated;
create policy assignment_read on public.assurance_assignments for select to authenticated using(exists(select 1 from public.assurance_records r where r.id=record_id and workspace_private.project_access(r.project_id,false)));
create policy review_read on public.assurance_reviews for select to authenticated using(exists(select 1 from public.assurance_records r where r.id=record_id and workspace_private.project_access(r.project_id,false)));

create function workspace_private.engineer_is_eligible(pid uuid, uid uuid, reviewer boolean)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists(
 select 1 from public.projects p join public.project_engineers e on e.project_id=p.id
 join public.organisation_members om on om.organisation_id=p.organisation_id and om.user_id=e.user_id
 where p.id=pid and p.status='active' and e.user_id=uid and e.active and (not reviewer or e.can_review)
 and (om.role='admin' or exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=uid and pm.role='editor'))
); $$;
revoke all on function workspace_private.engineer_is_eligible(uuid,uuid,boolean) from public,anon,authenticated;

-- Only organisation admins can explicitly add an already registered account to this project.
create function workspace_private.configure_project_engineer(pid uuid, account_email text, person_name text, job_role text, review_permission boolean, enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare oid uuid; uid uuid;
begin
 select organisation_id into oid from public.projects where id=pid and status='active';
 if auth.uid() is null or oid is null or not workspace_private.org_member(oid,true) then raise exception 'Project administrator required' using errcode='42501'; end if;
 select id into uid from auth.users where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null and deleted_at is null limit 1;
 if uid is null then raise exception 'No confirmed registered account found'; end if;
 if enabled then
 insert into public.organisation_members(organisation_id,user_id,role) values(oid,uid,'member') on conflict do nothing;
 insert into public.project_members(project_id,user_id,role) values(pid,uid,'editor') on conflict(project_id,user_id) do update set role='editor';
 end if;
 insert into public.project_engineers(project_id,user_id,display_name,designation,can_review,active) values(pid,uid,trim(person_name),job_role,review_permission,enabled)
 on conflict(project_id,user_id) do update set display_name=excluded.display_name,designation=excluded.designation,can_review=excluded.can_review,active=excluded.active;
 return uid;
end; $$;
revoke all on function workspace_private.configure_project_engineer(uuid,text,text,text,boolean,boolean) from public,anon;
grant execute on function workspace_private.configure_project_engineer(uuid,text,text,text,boolean,boolean) to authenticated;
create function public.configure_project_engineer(pid uuid, account_email text, person_name text, job_role text, review_permission boolean, enabled boolean)
returns uuid language sql security invoker set search_path='' as $$ select workspace_private.configure_project_engineer(pid,account_email,person_name,job_role,review_permission,enabled); $$;
revoke all on function public.configure_project_engineer(uuid,text,text,text,boolean,boolean) from public,anon;
grant execute on function public.configure_project_engineer(uuid,text,text,text,boolean,boolean) to authenticated;

create function workspace_private.manage_assurance_workflow(rid uuid, expected_version integer, operation text, target_user uuid default null, comment_text text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare r public.assurance_records%rowtype; review public.assurance_reviews%rowtype; actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into r from public.assurance_records where id=rid for update;
 if not found or r.kind not in ('tq','variation') or not workspace_private.project_access(r.project_id,true) or not exists(select 1 from public.projects where id=r.project_id and status='active') then raise exception 'Edit access required' using errcode='42501'; end if;
 if r.version<>expected_version then raise exception 'Record has changed; refresh first'; end if;
 if char_length(coalesce(comment_text,''))>4000 then raise exception 'Comment too long'; end if;
 if operation='assign' then
  if target_user is null then delete from public.assurance_assignments where record_id=rid;
  else
   if not workspace_private.engineer_is_eligible(r.project_id,target_user,false) then raise exception 'Choose an active project engineer'; end if;
   insert into public.assurance_assignments(record_id,assignee_id,assigned_by) values(rid,target_user,actor)
   on conflict(record_id) do update set assignee_id=excluded.assignee_id,assigned_by=actor,assigned_at=now();
  end if;
 elsif operation='request' then
  if r.status in ('closed','withdrawn') then raise exception 'Reopen the record before requesting review'; end if;
  if target_user is null or target_user=actor or target_user=r.updated_by or not workspace_private.engineer_is_eligible(r.project_id,target_user,true) then raise exception 'Select an independent authorised internal reviewer'; end if;
  insert into public.assurance_reviews(record_id,record_version,reviewer_id,requested_by,request_note) values(rid,r.version,target_user,actor,coalesce(comment_text,''));
 elsif operation in ('approved','changes_requested') then
  select * into review from public.assurance_reviews where record_id=rid and record_version=r.version for update;
  if not found or review.status<>'pending' or review.reviewer_id<>actor or review.requested_by=actor or r.updated_by=actor or not workspace_private.engineer_is_eligible(r.project_id,actor,true) then raise exception 'Only the designated independent reviewer may decide' using errcode='42501'; end if;
  if r.status in ('closed','withdrawn') then raise exception 'Record is no longer open for review'; end if;
  if operation='changes_requested' and char_length(trim(coalesce(comment_text,'')))=0 then raise exception 'Explain the requested changes'; end if;
  update public.assurance_reviews set status=operation,decision_note=coalesce(comment_text,''),decided_at=now(),decided_by=actor where id=review.id;
 else raise exception 'Unsupported operation'; end if;
end; $$;
revoke all on function workspace_private.manage_assurance_workflow(uuid,integer,text,uuid,text) from public,anon;
grant execute on function workspace_private.manage_assurance_workflow(uuid,integer,text,uuid,text) to authenticated;
create function public.manage_assurance_workflow(rid uuid, expected_version integer, operation text, target_user uuid default null, comment_text text default '')
returns void language sql security invoker set search_path='' as $$ select workspace_private.manage_assurance_workflow(rid,expected_version,operation,target_user,comment_text); $$;
revoke all on function public.manage_assurance_workflow(uuid,integer,text,uuid,text) from public,anon;
grant execute on function public.manage_assurance_workflow(uuid,integer,text,uuid,text) to authenticated;
commit;