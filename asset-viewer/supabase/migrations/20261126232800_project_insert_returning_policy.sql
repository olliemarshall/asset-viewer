-- Project INSERT ... RETURNING must authorize the newly inserted row
-- without querying that same row through a STABLE helper's snapshot.
-- Organisation administrators already have this access; the project member
-- branch retains the original membership checks.
begin;
alter policy project_read on public.projects
  using (workspace_private.org_member(organisation_id,true)
         or workspace_private.project_access(id,false));
commit;
