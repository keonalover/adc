import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import {
  DEMO_CLIENT_ID,
  DEMO_LOCATION_ID,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from './config.js';
import { sampleData } from './data/sampleData.js';
import { renderBreakRisk } from './features/breakRisk.js';
import { renderInventory } from './features/inventory.js';
import { renderLabor } from './features/labor.js';
import { renderSales } from './features/sales.js';
import { renderWeeklyActions } from './features/weeklyActions.js';

// Supabase settings for the current demo client/location.
const CLIENT_ID = DEMO_CLIENT_ID;
const LOCATION_ID = DEMO_LOCATION_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const db = () => supabase.schema('warehouse');
const rawDb = () => supabase.schema('raw');

// Simple page state. Feature modules receive the values they need.
const state = {
  activeDays: 30,
  activeSort: 'revenue',
  salesRows: [],
  locationName: 'Current location',
};

init();

async function init() {
  setFooter('loading...', 'var(--accent)');
  bindControls();

  try {
    await loadContext();
    state.salesRows = await fetchSales();
    await fetchLastUpdated();

    renderAllFeatures();
    setFooter('ready');
  } catch (error) {
    console.error(error);
    setFooter('error - check console', 'var(--danger)');
    showSalesError(error.message);
  }
}

function bindControls() {
  document.getElementById('filter-bar')?.addEventListener('click', (event) => {
    const button = event.target.closest('.filter-btn');
    if (!button) return;

    document.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');

    state.activeDays = parseInt(button.dataset.days, 10);
    renderSalesFeature();
  });

  document.querySelectorAll('.items-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.items-tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');

      state.activeSort = tab.dataset.sort;
      renderSalesFeature();
    });
  });
}

async function loadContext() {
  const [{ data: client }, { data: location }] = await Promise.all([
    db().from('clients').select('business_name').eq('client_id', CLIENT_ID).single(),
    db().from('dim_location').select('location_name').eq('location_id', LOCATION_ID).single(),
  ]);

  state.locationName = location?.location_name || 'Current location';
  setText('ctx-client', client?.business_name || '-');
  setText('ctx-location', state.locationName);
}

async function fetchSales() {
  const [{ data: sales, error: salesError }, { data: products, error: productError }] = await Promise.all([
    db()
      .from('fact_sales')
      .select(`
        gross_sales,
        net_sales,
        quantity,
        location_id,
        transaction_id,
        batch_id,
        date_id,
        product_id
      `)
      .eq('client_id', CLIENT_ID)
      .eq('location_id', LOCATION_ID),
    db()
      .from('dim_product')
      .select('product_id, item_name')
      .eq('client_id', CLIENT_ID)
      .eq('location_id', LOCATION_ID),
  ]);

  if (salesError) throw salesError;
  if (productError) throw productError;

  const rawRows = await fetchRawRowsForSales(sales || []);
  return normalizeSalesRows(sales, products, rawRows);
}

async function fetchRawRowsForSales(salesRows) {
  const batchIds = [...new Set(salesRows.map((row) => row.batch_id).filter(Boolean))];
  if (!batchIds.length) return [];

  const { data, error } = await rawDb()
    .from('sales_uploads')
    .select('batch_id, raw_data')
    .in('batch_id', batchIds);

  if (error) throw error;
  return data || [];
}

// Keep fetch/normalization together so feature files can focus on rendering.
function normalizeSalesRows(salesRows, productRows, rawRows) {
  const productNameById = Object.fromEntries(
    (productRows || []).map((product) => [product.product_id, product.item_name])
  );

  const rawLocationByLine = Object.fromEntries(
    (rawRows || []).map((row) => {
      const raw = row.raw_data || {};
      const key = makeSalesLineKey(row.batch_id, raw.transaction_id, raw.item_name);
      return [key, raw.location];
    })
  );

  return (salesRows || []).map((row) => ({
    ...row,
    revenue_amount: row.net_sales ?? row.gross_sales ?? 0,
    source_location: rawLocationByLine[
      makeSalesLineKey(row.batch_id, row.transaction_id, productNameById[row.product_id])
    ],
    dim_date: { full_date: row.date_id },
    dim_product: { item_name: productNameById[row.product_id] || 'Unknown' },
  }));
}

function makeSalesLineKey(batchId, transactionId, itemName) {
  return [
    batchId || '',
    transactionId || '',
    (itemName || '').trim().toLowerCase(),
  ].join('::');
}

async function fetchLastUpdated() {
  const { data } = await db()
    .from('fact_sales')
    .select('created_at')
    .eq('client_id', CLIENT_ID)
    .eq('location_id', LOCATION_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.created_at) return;

  const updatedAt = new Date(data.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  setText('ctx-last-updated', updatedAt);
}

function renderAllFeatures() {
  renderSalesFeature();
  renderLabor(sampleData.labor);
  renderBreakRisk(sampleData.breakRisk);
  renderInventory(sampleData.inventory);
  renderWeeklyActions(sampleData.weeklyActions);
}

function renderSalesFeature() {
  renderSales(state.salesRows, {
    activeDays: state.activeDays,
    activeSort: state.activeSort,
    locationName: state.locationName,
  });
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

function showSalesError(message) {
  const body = document.getElementById('items-body');
  if (!body) return;

  body.innerHTML = `<div class="empty-state"><strong>Could not load data</strong>${message}</div>`;
}
