-- Temporary demo policies for the browser anon key.
-- These keep access scoped to the current demo client used in js/config.js.

grant usage on schema raw to anon;
grant usage on schema warehouse to anon;

grant select on warehouse.red_flags to anon;
grant select on warehouse.location_snapshots to anon;
grant select on warehouse.owner_actions to anon;

grant insert, select on raw.report_uploads to anon;
grant insert, select, update on raw.upload_batches to anon;

alter table raw.report_uploads enable row level security;
alter table warehouse.red_flags enable row level security;
alter table warehouse.location_snapshots enable row level security;
alter table warehouse.owner_actions enable row level security;

drop policy if exists "anon can read demo red flags" on warehouse.red_flags;
create policy "anon can read demo red flags"
on warehouse.red_flags
for select
to anon
using (client_id = '28968816-6e16-433a-86cd-293a0a2b7ac5');

drop policy if exists "anon can read demo location snapshots" on warehouse.location_snapshots;
create policy "anon can read demo location snapshots"
on warehouse.location_snapshots
for select
to anon
using (client_id = '28968816-6e16-433a-86cd-293a0a2b7ac5');

drop policy if exists "anon can read demo owner actions" on warehouse.owner_actions;
create policy "anon can read demo owner actions"
on warehouse.owner_actions
for select
to anon
using (client_id = '28968816-6e16-433a-86cd-293a0a2b7ac5');

drop policy if exists "anon can stage demo report uploads" on raw.report_uploads;
create policy "anon can stage demo report uploads"
on raw.report_uploads
for insert
to anon
with check (client_id = '28968816-6e16-433a-86cd-293a0a2b7ac5');

drop policy if exists "anon can read demo report uploads" on raw.report_uploads;
create policy "anon can read demo report uploads"
on raw.report_uploads
for select
to anon
using (client_id = '28968816-6e16-433a-86cd-293a0a2b7ac5');
