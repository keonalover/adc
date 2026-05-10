import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {
  DEMO_CLIENT_ID,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const db = () => supabase.schema('warehouse');
const weekStart = currentWeekStart();

init();

async function init() {
  setFooter('loading...', 'var(--accent)');

  try {
    const [flags, snapshots, actions] = await Promise.all([
      fetchRedFlags(),
      fetchLocationSnapshots(),
      fetchOwnerActions(),
    ]);

    if (flags.length) {
      renderSummary(flags);
      renderRedFlags(flags);
    }

    if (snapshots.length) renderSnapshots(snapshots);
    if (actions.length) renderActions(actions);

    setFooter(flags.length || snapshots.length || actions.length ? 'supabase data' : 'static demo brief');
  } catch (error) {
    console.warn('Using static red flag demo because Supabase brief tables are not ready:', error);
    setFooter('static demo brief');
  }
}

async function fetchRedFlags() {
  const { data, error } = await db()
    .from('red_flags')
    .select(`
      flag_type,
      location_name,
      severity,
      what_happened,
      why_it_matters,
      owner_action,
      data_source,
      dispute_risk_amount,
      sort_order,
      created_at
    `)
    .eq('client_id', DEMO_CLIENT_ID)
    .gte('week_start', weekStart)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchLocationSnapshots() {
  const { data, error } = await db()
    .from('location_snapshots')
    .select(`
      location_name,
      sales_trend,
      labor_percent,
      discount_percent,
      refund_risk,
      review_risk,
      owner_priority,
      sort_order,
      created_at
    `)
    .eq('client_id', DEMO_CLIENT_ID)
    .gte('week_start', weekStart)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchOwnerActions() {
  const { data, error } = await db()
    .from('owner_actions')
    .select('title, description, sort_order, created_at')
    .eq('client_id', DEMO_CLIENT_ID)
    .gte('week_start', weekStart)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderSummary(flags) {
  const locations = new Set(flags.map((flag) => flag.location_name).filter(Boolean));
  const disputeRisk = flags.reduce((sum, flag) => sum + Number(flag.dispute_risk_amount || 0), 0);
  const highLocation = mostFrequent(
    flags.filter((flag) => normalizeSeverity(flag.severity) === 'high').map((flag) => flag.location_name)
  );

  setText('summary-red-flags-value', flags.length);
  setText('summary-red-flags-sub', 'Red Flags Detected');
  setText('summary-locations-value', locations.size || '-');
  setText('summary-locations-sub', 'Locations Reviewed');
  setText('summary-risk-value', disputeRisk ? formatCurrency(disputeRisk) : '$0');
  setText('summary-risk-sub', '3PO Dispute Risk');
  setText('summary-priority-value', shortStoreName(highLocation) || '-');
  setText('summary-priority-sub', highLocation ? `${highLocation} Needs Attention` : 'Needs Attention');
}

function renderRedFlags(flags) {
  const el = document.getElementById('red-flag-list');
  if (!el) return;

  el.innerHTML = flags.map((flag) => {
    const severity = normalizeSeverity(flag.severity);
    return `
      <article class="red-flag-card ${severity === 'high' ? 'high' : ''}">
        <div class="red-flag-top">
          <div>
            <h3 class="red-flag-type">${escapeHtml(flag.flag_type)}</h3>
            <p class="red-flag-location">${escapeHtml(flag.location_name)}</p>
          </div>
          <span class="severity-badge ${severity}">${capitalize(severity)}</span>
        </div>
        <div class="brief-list">
          ${briefItem('What happened', flag.what_happened)}
          ${briefItem('Why it matters', flag.why_it_matters)}
          ${briefItem('Owner action', flag.owner_action)}
        </div>
        <p class="data-source">Data source: ${escapeHtml(flag.data_source)}</p>
      </article>
    `;
  }).join('');
}

function renderSnapshots(snapshots) {
  const el = document.getElementById('snapshot-body');
  if (!el) return;

  el.innerHTML = snapshots.map((row) => `
    <tr>
      <td>${escapeHtml(row.location_name)}</td>
      <td>${escapeHtml(row.sales_trend)}</td>
      <td>${formatPercent(row.labor_percent)}</td>
      <td>${formatPercent(row.discount_percent)}</td>
      <td>${escapeHtml(row.refund_risk)}</td>
      <td>${escapeHtml(row.review_risk)}</td>
      <td><span class="${priorityClass(row.owner_priority)}">${escapeHtml(row.owner_priority)}</span></td>
    </tr>
  `).join('');
}

function renderActions(actions) {
  const el = document.getElementById('owner-actions-list');
  if (!el) return;

  el.innerHTML = actions.map((action) => `
    <article class="owner-action-card">
      <h3 class="owner-action-title">${escapeHtml(action.title)}</h3>
      <p class="owner-action-copy">${escapeHtml(action.description)}</p>
    </article>
  `).join('');
}

function briefItem(label, value) {
  return `
    <div class="brief-item">
      <span class="brief-label">${label}</span>
      <p class="brief-copy">${escapeHtml(value)}</p>
    </div>
  `;
}

function setFooter(message, color) {
  const el = document.getElementById('footer-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = color || 'var(--muted)';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function normalizeSeverity(value) {
  return String(value || 'medium').trim().toLowerCase() === 'high' ? 'high' : 'medium';
}

function priorityClass(value) {
  return String(value || '').toLowerCase() === 'high' ? 'priority-high' : 'priority-medium';
}

function mostFrequent(values) {
  const counts = {};
  values.filter(Boolean).forEach((value) => {
    counts[value] = (counts[value] || 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function shortStoreName(value) {
  const match = String(value || '').match(/store\s+([a-z0-9]+)/i);
  return match ? match[1].toUpperCase() : value;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentWeekStart() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}
