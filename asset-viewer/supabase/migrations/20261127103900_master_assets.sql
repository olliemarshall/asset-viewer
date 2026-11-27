begin;
alter table public.schemes add constraint schemes_id_project_unique unique(id,project_id);
alter table public.assurance_records add constraint assurance_records_id_project_unique unique(id,project_id);
create table public.master_assets (
 id uuid primary key default gen_random_uuid(),
 scheme_id uuid not null,
 project_id uuid not null,
 reference text not null check(char_length(trim(reference)) between 1 and 200 and reference=trim(reference)),
 name text not null default '' check(char_length(name)<=250),
 discipline text not null default 'Unassigned' check(discipline in ('Unassigned','Signalling','Track','E&P','Civils','Telecoms','Other')),
 asset_type text not null default 'unclassified' check(char_length(asset_type) between 1 and 150),
 status text not null default 'REVIEW' check(status in ('NEW','EXISTING','RECOVER','PROPOSED','REVIEW')),
 owner text not null default '' check(char_length(owner)<=200),
 notes text not null default '' check(char_length(notes)<=8000),
 version integer not null default 1 check(version>0),
 updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key(scheme_id,project_id) references public.schemes(id,project_id) on delete restrict,
 unique(id,scheme_id),unique(id,project_id)
);
create unique index master_assets_reference_unique on public.master_assets(scheme_id,lower(reference));
create index master_assets_project_idx on public.master_assets(project_id);
create trigger master_asset_stamp before insert or update on public.master_assets for each row execute function workspace_private.stamp_calloff_set();

-- One call-off on one drawing revision may identify one master asset.
-- No geometric or engineering attributes are implicitly copied or synchronised.
create table public.asset_drawing_links (
 drawing_id uuid not null,
 calloff_id text not null check(char_length(calloff_id) between 6 and 512 and (calloff_id like 'auto:%' or calloff_id like 'manual:%')),
 asset_id uuid not null,
 scheme_id uuid not null,
 linked_version integer not null check(linked_version>0),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 primary key(drawing_id,calloff_id),
 foreign key(drawing_id,scheme_id) references public.drawings(id,scheme_id) on delete restrict,
 foreign key(asset_id,scheme_id) references public.master_assets(id,scheme_id) on delete restrict
);
create index asset_drawing_links_asset_idx on public.asset_drawing_links(asset_id);
create table public.asset_assurance_links (
 asset_id uuid not null,
 record_id uuid not null,
 project_id uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 primary key(asset_id,record_id),
 foreign key(asset_id,project_id) references public.master_assets(id,project_id) on delete restrict,
 foreign key(record_id,project_id) references public.assurance_records(id,project_id) on delete restrict
);
create index asset_assurance_links_record_idx on public.asset_assurance_links(record_id);

alter table public.master_assets enable row level security;
alter table public.asset_drawing_links enable row level security;
alter table public.asset_assurance_links enable row level security;
revoke all on public.master_assets,public.asset_drawing_links,public.asset_assurance_links from public,anon,authenticated;
grant select on public.master_assets,public.asset_drawing_links,public.asset_assurance_links to authenticated;
grant insert(scheme_id,project_id,reference,name,discipline,asset_type,status,owner,notes),update(reference,name,discipline,asset_type,status,owner,notes,version) on public.master_assets to authenticated;
grant insert(drawing_id,calloff_id,asset_id,scheme_id,linked_version),delete on public.asset_drawing_links to authenticated;
grant insert(asset_id,record_id,project_id),delete on public.asset_assurance_links to authenticated;
create policy master_asset_read on public.master_assets for select to authenticated using(workspace_private.drawing_scheme_access(scheme_id,false));
create policy master_asset_insert on public.master_assets for insert to authenticated with check(workspace_private.drawing_scheme_access(scheme_id,true));
create policy master_asset_update on public.master_assets for update to authenticated using(workspace_private.drawing_scheme_access(scheme_id,true)) with check(workspace_private.drawing_scheme_access(scheme_id,true));
create policy asset_drawing_read on public.asset_drawing_links for select to authenticated using(workspace_private.ready_drawing_access(drawing_id,false));
create policy asset_drawing_insert on public.asset_drawing_links for insert to authenticated with check(
 workspace_private.ready_drawing_access(drawing_id,true) and
 exists(select 1 from public.drawing_calloff_sets s where s.drawing_id=asset_drawing_links.drawing_id and s.version=linked_version and (
 (calloff_id like 'manual:%' and jsonb_typeof(s.payload->'records'->'manual'->calloff_id)='object')
 or (calloff_id like 'auto:%' and exists(select 1 from jsonb_array_elements(s.payload->'extracted') e where 'auto:'||(e->>'label')=calloff_id)
 and coalesce(s.payload->'records'->'overrides'->calloff_id->>'dismissed','false')<>'true')
 ))
);
create policy asset_drawing_unlink on public.asset_drawing_links for delete to authenticated using(workspace_private.ready_drawing_access(drawing_id,true));
create policy asset_assurance_read on public.asset_assurance_links for select to authenticated using(workspace_private.project_access(project_id,false));
create policy asset_assurance_insert on public.asset_assurance_links for insert to authenticated with check(exists(select 1 from public.master_assets a where a.id=asset_id and workspace_private.drawing_scheme_access(a.scheme_id,true)));
create policy asset_assurance_unlink on public.asset_assurance_links for delete to authenticated using(exists(select 1 from public.master_assets a where a.id=asset_id and workspace_private.drawing_scheme_access(a.scheme_id,true)));
commit;