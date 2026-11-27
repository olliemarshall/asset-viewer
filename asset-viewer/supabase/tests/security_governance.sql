begin;
-- Run after the migration in a disposable database, or inside a rollback-only transaction.
select set_config('sw_test.admin',gen_random_uuid()::text,true);
select set_config('sw_test.editor',gen_random_uuid()::text,true);
select set_config('sw_test.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,aud,role)
select x::uuid,'sw-governance-'||x||'@example.invalid',now(),'authenticated','authenticated'
from unnest(array[current_setting('sw_test.admin'),current_setting('sw_test.editor'),current_setting('sw_test.outsider')]) x;
select set_config('request.jwt.claim.sub',current_setting('sw_test.admin'),true);
set local role authenticated;
do $test$
declare a uuid:=current_setting('sw_test.admin')::uuid; e uuid:=current_setting('sw_test.editor')::uuid; o uuid:=current_setting('sw_test.outsider')::uuid; oid uuid; pid uuid; rid uuid; apid uuid; lid uuid; v integer;
begin
 oid:=public.create_workspace_organisation('Governance test');
 insert into public.projects(organisation_id,name,reference) values(oid,'Governance test','TEST') returning id into pid;
 perform public.configure_project_engineer(pid,'sw-governance-'||e::text||'@example.invalid','Test reviewer','CEM',true,true);
 insert into public.assurance_records(project_id,kind,reference,title) values(pid,'tq','TQ-TEST','Test query') returning id into rid;
 insert into public.assurance_records(project_id,kind,reference,title) values(pid,'appointment','APP-TEST','Test appointment') returning id into apid;
 insert into public.assurance_attachments(record_id,title,kind,url,upload_status) values(apid,'Restricted link','link','https://example.invalid/appointment','ready');
 insert into public.assurance_attachments(record_id,title,kind,url,upload_status) values(rid,'Evidence','link','https://example.invalid/evidence','ready') returning id into lid;
 select version into v from public.assurance_records where id=rid;
 if v<>2 then raise exception 'Evidence did not advance version';end if;
 perform public.manage_assurance_workflow(rid,v,'request',e,'Test request');
 if not exists(select 1 from public.assurance_reviews where record_id=rid and evidence_snapshot->'attachments'->0->>'id'=lid::text) then raise exception 'Snapshot missing attachment';end if;
 if not exists(select 1 from public.project_audit_events where project_id=pid and entity='assurance_records' and operation='UPDATE') then raise exception 'Audit missing record update';end if;
 begin insert into public.project_audit_events(project_id,entity,operation) values(pid,'fake','INSERT');raise exception 'Audit forgery allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',e::text,true);
 if exists(select 1 from public.project_audit_events where project_id=pid) then raise exception 'Editor can see audit';end if;
 if exists(select 1 from public.assurance_attachments where record_id=apid) then raise exception 'Appointment attachment exposed';end if;
 if not exists(select 1 from public.assurance_attachments where id=lid) then raise exception 'Ordinary evidence hidden';end if;
 begin perform public.set_project_member_access(pid,a,'revoked');raise exception 'Editor membership mutation allowed';exception when insufficient_privilege then null;end;
 perform public.manage_assurance_workflow(rid,v,'approved',null,'Test approval');
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.assurance_attachments(record_id,title,kind,url,upload_status) values(rid,'New evidence','link','https://example.invalid/new','ready');
 if not exists(select 1 from public.assurance_records where id=rid and version=v+1) then raise exception 'Approval not superseded';end if;
 if exists(select 1 from public.assurance_reviews where record_id=rid and record_version=v+1) then raise exception 'Approval inherited';end if;
 perform public.set_project_member_access(pid,e,'viewer');
 perform set_config('request.jwt.claim.sub',e::text,true);
 if not workspace_private.project_access(pid,false) or workspace_private.project_access(pid,true) then raise exception 'Viewer access incorrect';end if;
 begin insert into public.assurance_records(project_id,kind,reference,title) values(pid,'tq','NO','No write');raise exception 'Viewer write allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.set_project_member_access(pid,e,'revoked');
 perform set_config('request.jwt.claim.sub',e::text,true);
 if workspace_private.project_access(pid,false) or exists(select 1 from public.assurance_records where id=rid) or exists(select 1 from public.assurance_attachments where id=lid) then raise exception 'Revocation failed';end if;
 perform set_config('request.jwt.claim.sub',o::text,true);
 if exists(select 1 from public.project_audit_events where project_id=pid) or exists(select 1 from public.assurance_reviews where record_id=rid) then raise exception 'Outsider exposed';end if;
end $test$;
select 'Passed: audit attribution/forgery prevention, restricted appointment evidence, snapshot/approval, evidence version invalidation, viewer and revocation isolation' as result;
rollback;
