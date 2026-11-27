begin;
-- Exact supplied source versions only. No template content is seeded.
create table public.native_word_templates (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 kind text not null check(kind in ('tq','rfi')),
 fingerprint text not null,
 original_base64 text not null check(char_length(original_base64)<=400000),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(project_id,kind),
 check ((kind='tq' and fingerprint='7cd1f519c60275cfb7266f256dc2b04138cd876a166cafd8d40f2228beb99540') or
 (kind='rfi' and fingerprint='4799b9a2571a30d253b40131482c9d6e40954bd422abf52b5521c1512bb90ce0')),
 check (encode(sha256(decode(original_base64,'base64')),'hex')=fingerprint)
);
alter table public.native_word_templates enable row level security;
revoke all on public.native_word_templates from public,anon,authenticated;
grant select on public.native_word_templates to authenticated;
grant insert(project_id,kind,fingerprint,original_base64) on public.native_word_templates to authenticated;
create policy native_template_read on public.native_word_templates for select to authenticated using(workspace_private.project_access(project_id,false));
create policy native_template_insert on public.native_word_templates for insert to authenticated with check(workspace_private.project_access(project_id,true) and exists(select 1 from public.projects p where p.id=project_id and p.status='active'));
commit;
