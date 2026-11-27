# SchemeWorks development and governance
This draft now incorporates merged PR14. Do not merge or apply its governance migration to the shared database until the migration and frontend are tested together in staging. The migration includes master-asset audit triggers when those tables exist.

## Windows local development (Node 22 + Git + VS Code)
1. Install Git and Node.js 22 LTS. Clone the repository using your authorised GitHub account.
2. From PowerShell:
```powershell
git clone https://github.com/olliemarshall/asset-viewer.git
cd asset-viewer
git fetch origin
git switch --track origin/feature/security-governance
cd asset-viewer
npm install
npm test
npm run dev
```
3. Visit http://localhost:3000 and /workspace. Stop with Ctrl+C. For a production-style check: npm run build, npm start.
4. Create asset-viewer/.env.local from .env.example. Use only the URL and publishable key of a **separate development/staging Supabase project**, never a service-role key, personal access token or production credentials. Do not commit .env.local. To use authentication locally, allow http://localhost:3000/workspace in that project's Auth redirect URLs. With no env file the public homepage/standalone viewer can be inspected, but shared workspaces require configuration.
5. Apply the existing migration chain to a disposable database via the Supabase migration tooling; review migration history first. Do not blindly push migrations to the current connected database. Run supabase/tests/security_governance.sql after migrations. Tests create synthetic users/records in a transaction and roll back. Use a separate test database for repeated tests.
6. If switching an existing checkout, run git fetch origin, git switch feature/security-governance (or use --track on first switch), npm install, npm test.

## Security and governance scope
- The admin-only project audit viewer captures row changes after activation, including membership, documents and assurance workflow decisions. For assurance records it captures before/after data; for large drawing payloads, template content and native originals it records metadata/version, not their contents. No history backfill. Audit entries are protected from ordinary application clients, not from database administrators. No read/download logs or independent tamper-evident archive yet. Agree retention, access and backups before real use.
- Project Management is an additional read-only designation: it grants viewer membership, never internal review permission, and cannot be selected as an engineering assignee or reviewer. An administrator must change the designation before granting editor access. Organisation administrators cannot be enrolled as read-only Project Management members because their inherited rights take precedence.
- Organisation administrators can downgrade or revoke explicit project membership. RLS evaluates membership on subsequent API requests; files already downloaded cannot be recalled. Organisation-wide admins remain privileged. Disabling a roster entry is distinct from revocation. Existing assignments and review history remain visible to authorised users. Re-enable roster/review permission separately after restoring an editor.
- Appointment attachments are restricted to organisation administrators, not all project members. Appointment record fields remain project-visible. Do not store confidential competence information in those fields. A dedicated competence-evidence ACL and lifecycle is still required.
- New TQ/variation reviews store the exact saved record and ready attachment metadata/fingerprints. Adding ready evidence advances the version, superseding prior reviews. Older review decisions remain historical; legacy pending reviews need a new record version. File hashes are checked by the client, not verified server-side against object bytes. External document URLs are references, not controlled copies. Asset associations, template versions and formal issue/export files are not yet part of the review snapshot. Independent review checks requester and last editor, not every prior contributor.
- The organisation creation definer implementation is moved into a private schema behind the existing invoker API; unnecessary event-trigger execute grants are removed. Verify advisors after permanent deployment. Leaked password protection, MFA, dependency upgrades, lockfile and full security testing remain open. No settings or billing changes were made.
- This is development software, not a production compliance/security certification.

## Release checklist
- PR14 + PR15 integrated build and browser test.
- Test four separate accounts (administrator, editor, viewer, Project Management), an unrelated organisation and revocation while signed in.
- Test private Storage uploads/downloads, attachment review invalidation, and signed-link lifetime; confirm that historical reviews display correctly.
- Review dependency advisories and commit a verified npm lockfile; then change CI to npm ci.
- Run database security advisors and backup/restore tests on staging. Agree formal document issue/revision, approval scope, audit retention, role-specific permissions and recovery requirements before accepting real project data.

## PDF engine upgrade and security gate
The PDF.js dependency is pinned to 6.5.438, with the module worker and runtime data copied locally from the same package. Both drawing extraction and graphical reference search use the shared browser-only loader; no PDF scripting viewer is embedded. This addresses the affected old PDF.js version described in GHSA-wgrm-67xf-hhpq / CVE-2024-4367, and uses a version newer than the fix for GHSA-hq66-cqwq-w95j. The prior isEvalSupported flag was a mitigation, not a substitute for updating. The exact resolved dependency audit must still be run. Node 22.13.0 or later in the Node 22 line is required.

After pulling, run npm.cmd install, npm.cmd test, npm.cmd run audit:security, npm.cmd run build. Retain the generated package-lock.json for review and commit after confirming the install/audit; never use npm audit fix --force. Test vector and scanned drawings, zoom, highlights, saved call-off associations, and the reference PDF symbol finder in a browser. The npm registry was unreachable in the implementation environment, so no successful install, lockfile generation, new-engine browser test or complete audit is claimed. A high/critical audit finding is now a CI failure. Branch protection still needs configuration if this check is to be mandatory for merging.
