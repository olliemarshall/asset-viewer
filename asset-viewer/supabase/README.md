# Shared workspace foundation (development only)

This release adds /workspace beside the existing local prototype at /projects.
No existing browser records, drawings, or real engineering data are migrated.

## Setup
1. Use a separate, empty Supabase development project. Apply
   supabase/migrations/20261126231700_workspace_foundation.sql once.
   Review it first; do not run it against an existing production schema.
2. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   (legacy NEXT_PUBLIC_SUPABASE_ANON_KEY is also accepted) in Vercel Preview.
   Never set a service_role or secret key in a NEXT_PUBLIC variable.
3. Configure Supabase Auth site URL and approved confirmation redirect URLs
   for the development deployment's /workspace route. Use email confirmation.
4. Open /workspace on the preview, register a test account, confirm email,
   and create an organisation, project and scheme. Reload and sign in on
   another browser to check persistence.

## Access checks before merging
Use invented data and at least two unrelated accounts A and B.
- A creates organisation/project/scheme. B cannot read, update or insert into
  A's organisation/project even by guessing UUIDs or using direct REST calls.
- Anonymous requests cannot read or write any workspace records.
- An administrator can create projects and edit/archive them.
- Add a test organisation member and project viewer/editor with an authorised
  database administrator. The viewer can read only their assigned project;
  the editor can edit schemes but not project membership or project metadata.
- Remove a membership and confirm access is revoked. Ensure members cannot
  modify roles or move records into another organisation/project.
- Confirm that public functions cannot be called by anonymous sessions and
  that the private schema is not configured as an exposed API schema.

Membership administration and invitations are deliberately not exposed in the
UI yet. Archive is a reversible visibility/status label, not an access
boundary. There is no shared file storage, no shared asset register, no audit
trail, no password recovery screen and no controlled engineering workflow.
The database migration and browser integration must be independently tested.
