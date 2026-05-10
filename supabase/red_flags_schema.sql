-- ADC upload staging and red flag brief tables.
-- Run this in the Supabase SQL editor for the project:
-- https://czuyemwqfdunedfufqso.supabase.co

create schema if not exists raw;
create schema if not exists warehouse;

create table if not exists raw.report_uploads (
  report_upload_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  client_id uuid not null,
  location_id uuid,
  report_type text not null,
  source_system text,
  row_index integer not null,
  raw_data jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_uploads_batch_id_idx
  on raw.report_uploads (batch_id);

create index if not exists report_uploads_client_report_idx
  on raw.report_uploads (client_id, report_type, created_at desc);

create table if not exists warehouse.red_flags (
  red_flag_id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid,
  location_name text not null,
  week_start date default date_trunc('week', now())::date,
  flag_type text not null,
  severity text not null check (severity in ('High', 'Medium')),
  what_happened text not null,
  why_it_matters text not null,
  owner_action text not null,
  data_source text not null,
  dispute_risk_amount numeric(12,2) default 0,
  sort_order integer not null default 100,
  status text not null default 'open',
  source_batch_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists red_flags_client_week_idx
  on warehouse.red_flags (client_id, week_start desc, sort_order);

create table if not exists warehouse.location_snapshots (
  location_snapshot_id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid,
  location_name text not null,
  week_start date default date_trunc('week', now())::date,
  sales_trend text,
  labor_percent numeric(6,2),
  discount_percent numeric(6,2),
  refund_risk text,
  review_risk text,
  owner_priority text not null check (owner_priority in ('High', 'Medium', 'Low')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists location_snapshots_client_week_idx
  on warehouse.location_snapshots (client_id, week_start desc, sort_order);

create table if not exists warehouse.owner_actions (
  owner_action_id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  week_start date default date_trunc('week', now())::date,
  title text not null,
  description text not null,
  sort_order integer not null default 100,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists owner_actions_client_week_idx
  on warehouse.owner_actions (client_id, week_start desc, sort_order);

-- Optional demo seed matching the static brief. Safe to rerun after deleting old demo rows.
-- Replace the UUID if you change js/config.js.
insert into warehouse.red_flags (
  client_id, location_name, flag_type, severity, what_happened, why_it_matters,
  owner_action, data_source, dispute_risk_amount, sort_order
) values
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store B', 'Discount Spike', 'High', 'Discount rate hit 7.8%, compared to a 2.4% multi-location average.', 'Unusual discount behavior may point to promo confusion, cashier misuse, or weak manager approval controls.', 'Review discount permissions and closing shift discount activity with the Store B manager.', 'POS discount report', 0, 1),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store C', 'Refund Pattern', 'High', 'Refunds increased 41% week over week, mostly during evening shifts.', 'Refund spikes can signal order accuracy problems, customer recovery issues, or cashier training gaps.', 'Check refund reasons, shift notes, and manager approvals for the affected days.', 'POS refund report', 0, 2),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store A', '3PO Leakage', 'Medium', 'DoorDash disputes totaled $436 this week, with most claims tied to missing items.', 'Repeated delivery disputes can reduce net payout and reveal packaging or handoff issues.', 'Review the 3PO handoff checklist and compare disputed orders against packaging procedures.', 'DoorDash dispute report', 436, 3),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store A', 'Labor Drag', 'Medium', 'Labor cost reached 38% during a low-sales Tuesday daypart.', 'High labor during soft sales windows may indicate overstaffing, late clock-outs, or weak labor cutting.', 'Compare scheduled labor to actual punches and review the manager''s cut decisions.', 'Labor summary report', 0, 4),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store B', 'Review Warning', 'High', 'Three negative reviews in five days mentioned slow service.', 'Repeated complaint themes can indicate a location-level service breakdown before ratings drop further.', 'Review staffing, ticket times, and order flow during the complaint windows.', 'Google/Yelp manual review scan', 0, 5);

insert into warehouse.location_snapshots (
  client_id, location_name, sales_trend, labor_percent, discount_percent,
  refund_risk, review_risk, owner_priority, sort_order
) values
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store A', 'Stable', 38, 2.9, 'Low', 'Low', 'Medium', 1),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store B', 'Down 12%', 31, 7.8, 'Medium', 'High', 'High', 2),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Store C', 'Up 4%', 29, 2.1, 'High', 'Medium', 'High', 3);

insert into warehouse.owner_actions (
  client_id, title, description, sort_order
) values
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Review Store B discount controls', 'Confirm who can approve discounts and check closing shift activity.', 1),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Audit Store C refund reasons', 'Compare reasons, dayparts, and manager approvals for the spike.', 2),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Check Store A 3PO packaging process', 'Match missing-item disputes against handoff and bagging procedures.', 3),
('28968816-6e16-433a-86cd-293a0a2b7ac5', 'Compare Store A Tuesday labor to actual sales', 'Review schedule, punches, and manager cut decisions for the daypart.', 4);
