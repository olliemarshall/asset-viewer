begin;
-- This migration is independent of PR14. Apply only after staging verification.
create table public.project_audit_events (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id) on delete restrict,
 actor_id uuid,
 occurred_at timestamptz not null default clock_timestamp(),
 entity text not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 before_state jsonb,
 after_state jsonb
);
create index project_audit_events_project_idx on public.project_audit_events(project_id,id desc);
alter table public.project_audit_events enable row level security;
revoke all on public.project_audit_events from public,anon,authenticated;
grant select on public.project_audit_events to authenticated;
revoke all on sequence public.project_audit_events_id_seq from public,anon,authenticated;
create policy audit_admin_read on public.project_audit_events for select to authenticated using(
 exists(select 1 from public.projects p where p.id=project_id and workspace_private.org_member(p.organisation_id,true))
);
-- Only triggers write events. No user-facing write RPC. Never copy file bytes,
-- original templates, full drawing payloads or external URLs into the audit log.
create function workspace_private.audit_project_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare old_doc jsonb; new_doc jsonb; row_doc jsonb; pid uuid; sid uuid; rid uuid;
begin
 if tg_op<>'INSERT' then old_doc:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then new_doc:=to_jsonb(new);end if;
 row_doc:=coalesce(new_doc,old_doc);
 if tg_table_name='projects' then pid:=(row_doc->>'id')::uuid;
 elsif row_doc ? 'project_id' then pid:=(row_doc->>'project_id')::uuid;
 elsif row_doc ? 'scheme_id' then
  select project_id into pid from public.schemes where id=(row_doc->>'scheme_id')::uuid;
 elsif row_doc ? 'drawing_id' then
  select s.project_id into pid from public.drawings d join public.schemes s on s.id=d.scheme_id where d.id=(row_doc->>'drawing_id')::uuid;
 elsif row_doc ? 'record_id' then
  select project_id into pid from public.assurance_records where id=(row_doc->>'record_id')::uuid;
 end if;
 if pid is null then raise exception 'Cannot attribute audit event to project';end if;
 old_doc:=old_doc-'original_base64'-'body'-'payload'-'url'-'evidence_snapshot';
 new_doc:=new_doc-'original_base64'-'body'-'payload'-'url'-'evidence_snapshot';
 insert into public.project_audit_events(project_id,actor_id,entity,operation,before_state,after_state)
 values(pid,auth.uid(),tg_table_name,tg_op,old_doc,new_doc);
 return null;
end;$$;
revoke all on function workspace_private.audit_project_change() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['projects','project_members','schemes','drawings','drawing_folders','drawing_folder_locations','drawing_calloff_sets','assurance_records','assurance_attachments','assurance_templates','native_word_templates','project_engineers','assurance_assignments','assurance_reviews'] loop
  execute format('create trigger sw_audit_change after insert or update or delete on public.%I for each row execute function workspace_private.audit_project_change()',t);
 end loop;
 -- PR14 is independent; include its tables when that migration is already present.
 foreach t in array array['master_assets','asset_drawing_links','asset_assurance_links'] loop
  if to_regclass('public.'||t) is not null then
   execute format('create trigger sw_audit_change after insert or update or delete on public.%I for each row execute function workspace_private.audit_project_change()',t);
  end if;
 end loop;
end;$$;

-- Revoke project membership or downgrade to read-only. Organisation administrators
-- retain organisation-wide access; do not pretend to revoke that via a project role.
create function workspace_private.set_project_member_access(pid uuid, target_user uuid, access_level text)
returns void language plpgsql security definer set search_path=''
as $$
declare oid uuid;
begin
 select organisation_id into oid from public.projects where id=pid;
 if auth.uid() is null or oid is null or not workspace_private.org_member(oid,true) then raise exception 'Organisation administrator required' using errcode='42501';end if;
 if target_user=auth.uid() or exists(select 1 from public.organisation_members where organisation_id=oid and user_id=target_user and role='admin') then raise exception 'Organisation administrators cannot be revoked through project membership';end if;
 if access_level not in ('editor','viewer','revoked') or access_level is null then raise exception 'Invalid access level';end if;
 if not exists(select 1 from public.project_members where project_id=pid and user_id=target_user) then raise exception 'Project membership not found';end if;
 if access_level='editor' and exists(select 1 from public.project_engineers where project_id=pid and user_id=target_user and designation='Project Management') then raise exception 'Change the designation to an engineering role before granting editor access';end if;
 if access_level='revoked' then
  delete from public.project_members where project_id=pid and user_id=target_user;
 else
  update public.project_members set role=access_level where project_id=pid and user_id=target_user;
 end if;
 if access_level<>'editor' then
  update public.project_engineers set active=case when access_level='viewer' and designation='Project Management' then active else false end,can_review=false where project_id=pid and user_id=target_user;
 end if;
end;$$;
revoke all on function workspace_private.set_project_member_access(uuid,uuid,text) from public,anon;
grant execute on function workspace_private.set_project_member_access(uuid,uuid,text) to authenticated;
create function public.set_project_member_access(pid uuid,target_user uuid,access_level text)
returns void language sql security invoker set search_path=''
as $$select workspace_private.set_project_member_access(pid,target_user,access_level);$$;
revoke all on function public.set_project_member_access(uuid,uuid,text) from public,anon;
grant execute on function public.set_project_member_access(uuid,uuid,text) to authenticated;

-- Project management is a read-only designation, not an engineering appointment.
alter table public.project_engineers drop constraint project_engineers_designation_check;
alter table public.project_engineers add constraint project_engineers_designation_check check(designation in ('CRE','CEM','Engineer','Project Management'));
alter table public.project_engineers add constraint project_engineers_management_no_review check(designation<>'Project Management' or not can_review);
create or replace function workspace_private.configure_project_engineer(pid uuid, account_email text, person_name text, job_role text, review_permission boolean, enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare oid uuid; uid uuid; member_role text;
begin
 select organisation_id into oid from public.projects where id=pid and status='active';
 if auth.uid() is null or oid is null or not workspace_private.org_member(oid,true) then raise exception 'Project administrator required' using errcode='42501'; end if;
 select id into uid from auth.users where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null and deleted_at is null limit 1;
 if uid is null then raise exception 'No confirmed registered account found'; end if;
 if job_role not in ('CRE','CEM','Engineer','Project Management') or job_role is null then raise exception 'Invalid designation';end if;
 if job_role='Project Management' and exists(select 1 from public.organisation_members where organisation_id=oid and user_id=uid and role='admin') then raise exception 'Organisation administrator cannot be configured as a read-only project manager';end if;
 member_role:=case when job_role='Project Management' then 'viewer' else 'editor' end;
 review_permission:=coalesce(review_permission,false) and job_role<>'Project Management' and enabled;
 if enabled then
 insert into public.organisation_members(organisation_id,user_id,role) values(oid,uid,'member') on conflict do nothing;
 insert into public.project_members(project_id,user_id,role) values(pid,uid,member_role) on conflict(project_id,user_id) do update set role=excluded.role;
 elsif job_role='Project Management' then
 update public.project_members set role='viewer' where project_id=pid and user_id=uid;
 end if;
 insert into public.project_engineers(project_id,user_id,display_name,designation,can_review,active) values(pid,uid,trim(person_name),job_role,review_permission,enabled)
 on conflict(project_id,user_id) do update set display_name=excluded.display_name,designation=excluded.designation,can_review=excluded.can_review,active=excluded.active;
 return uid;
end; $$;

create or replace function workspace_private.engineer_is_eligible(pid uuid, uid uuid, reviewer boolean)
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and exists(
 select 1 from public.projects p join public.project_engineers e on e.project_id=p.id
 join public.organisation_members om on om.organisation_id=p.organisation_id and om.user_id=e.user_id
 where p.id=pid and p.status='active' and e.user_id=uid and e.active and e.designation<>'Project Management' and (not reviewer or e.can_review)
 and (om.role='admin' or exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=uid and pm.role='editor'))
); $$;

-- Restrict appointment files to organisation administrators for now.
-- Appointment register metadata remains project-visible. No confidential
-- competence evidence should be stored in the free-text record itself.
create function workspace_private.attachment_access(rid uuid, write_access boolean)
returns boolean language sql stable security definer set search_path=''
as $$select auth.uid() is not null and exists(
 select 1 from public.assurance_records r join public.projects p on p.id=r.project_id
 where r.id=rid and r.kind in ('tq','rfi','variation','appointment')
 and workspace_private.project_access(p.id,write_access)
 and (not write_access or p.status='active')
 and (r.kind<>'appointment' or workspace_private.org_member(p.organisation_id,true))
);$$;
revoke all on function workspace_private.attachment_access(uuid,boolean) from public,anon;
grant execute on function workspace_private.attachment_access(uuid,boolean) to authenticated;
alter policy assurance_attachment_read on public.assurance_attachments using(workspace_private.attachment_access(record_id,false) and (upload_status='ready' or created_by=auth.uid()));
alter policy assurance_attachment_insert on public.assurance_attachments with check(
 workspace_private.attachment_access(record_id,true) and created_by=auth.uid() and ((kind='file' and upload_status='pending') or (kind='link' and upload_status='ready')));
alter policy assurance_attachment_finalize on public.assurance_attachments using(
 workspace_private.attachment_access(record_id,true) and kind='file' and upload_status='pending' and created_by=auth.uid())
 with check(workspace_private.attachment_access(record_id,true) and kind='file' and upload_status='ready' and created_by=auth.uid() and workspace_private.assurance_attachment_object_exists(record_id,id));
-- Existing storage RLS consults attachment RLS, so the new restriction applies
-- to both metadata and object access.

-- Capture immutable record and ready attachment metadata on new review requests.
-- External URLs are references only; bytes at those destinations may change.
alter table public.assurance_reviews add column evidence_snapshot jsonb;
create function workspace_private.review_evidence(rid uuid)
returns jsonb language sql stable security definer set search_path=''
as $$select jsonb_build_object('record',to_jsonb(r),'attachments',coalesce(
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.assurance_attachments a where a.record_id=r.id and a.upload_status='ready'),'[]'::jsonb))
 from public.assurance_records r where r.id=rid;$$;
revoke all on function workspace_private.review_evidence(uuid) from public,anon,authenticated;
create function workspace_private.capture_review_evidence()
returns trigger language plpgsql security definer set search_path=''
as $$begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if tg_op='INSERT' then
  new.evidence_snapshot:=workspace_private.review_evidence(new.record_id);
 elsif new.status<>old.status then
  if old.evidence_snapshot is null then raise exception 'Legacy review has no evidence snapshot; save a new record version and request review again';end if;
  if old.evidence_snapshot is distinct from workspace_private.review_evidence(new.record_id) then raise exception 'Evidence changed; save a new version and request review again';end if;
 end if;
 return new;
end;$$;
revoke all on function workspace_private.capture_review_evidence() from public,anon,authenticated;
create trigger review_evidence_capture before insert or update on public.assurance_reviews for each row execute function workspace_private.capture_review_evidence();
-- A ready attachment changes the reviewed evidence. Increment the parent
-- version in the same transaction, making existing approvals historical.
create function workspace_private.attachment_advances_version()
returns trigger language plpgsql security definer set search_path=''
as $$begin
 if new.upload_status='ready' and (tg_op='INSERT' or old.upload_status<>'ready') then
  if not workspace_private.attachment_access(new.record_id,true) then raise exception 'Attachment access revoked' using errcode='42501';end if;
  update public.assurance_records set version=version+1 where id=new.record_id and kind in ('tq','variation');
 end if;
 return null;
end;$$;
revoke all on function workspace_private.attachment_advances_version() from public,anon,authenticated;
create trigger attachment_version_change after insert or update on public.assurance_attachments for each row execute function workspace_private.attachment_advances_version();

-- Move the existing authorised creation implementation out of public.
alter function public.create_workspace_organisation(text) set schema workspace_private;
create function public.create_workspace_organisation(org_name text) returns uuid
 language sql security invoker set search_path='' as $$select workspace_private.create_workspace_organisation(org_name);$$;
revoke all on function public.create_workspace_organisation(text) from public,anon;
grant execute on function public.create_workspace_organisation(text) to authenticated;
-- The Supabase event trigger itself is not an application RPC.
do $$begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end;$$;
commit;
