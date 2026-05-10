import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/+esm';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatInteger,
} from '../utils/formatters.js';

let dailyChart = null;
let locationChart = null;

// Register the chart types and scales used by this feature.
Chart.register(...registerables);

// Render the full sales feature: KPIs, charts, and top items.
export function renderSales(rows, options = {}) {
  const activeDays = options.activeDays ?? 30;
  const activeSort = options.activeSort ?? 'revenue';
  const visibleRows = filterByDays(rows, activeDays);

  renderKPIs(computeKPIs(visibleRows));
  renderDailyChart(revenueByDay(visibleRows));
  renderLocationChart(revenueByLocation(visibleRows));
  renderItems(visibleRows, activeSort);
}

function filterByDays(rows, days) {
  if (!days) return rows;

  const cutoff = cutoffDate(days);
  return rows.filter((row) => row.dim_date?.full_date >= cutoff);
}

function cutoffDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function computeKPIs(rows) {
  const totalRevenue = rows.reduce((sum, row) => sum + (row.revenue_amount || 0), 0);
  const transactionCount = new Set(rows.map((row) => row.transaction_id).filter(Boolean)).size || rows.length;
  const averageOrderValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;
  const days = new Set(rows.map((row) => row.dim_date?.full_date)).size;
  const averageDailyRevenue = days > 0 ? totalRevenue / days : 0;

  return { totalRevenue, transactionCount, averageOrderValue, averageDailyRevenue, days };
}

function renderKPIs(kpis) {
  setKPI('kpi-revenue', formatCurrency(kpis.totalRevenue), `across ${kpis.days} day${kpis.days !== 1 ? 's' : ''}`);
  setKPI('kpi-avg-daily', formatCurrency(kpis.averageDailyRevenue), 'per business day');
  setKPI('kpi-txn', formatInteger(kpis.transactionCount), 'orders');
  setKPI('kpi-aov', formatCurrency(kpis.averageOrderValue), 'per order');
}

function setKPI(id, value, subtext) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove('skeleton', 'kpi-value-loading');
  el.textContent = value;

  const subEl = document.getElementById(`${id}-sub`);
  if (subEl) subEl.textContent = subtext || '';
}

function revenueByDay(rows) {
  const revenueByDate = {};

  rows.forEach((row) => {
    const date = row.dim_date?.full_date;
    if (!date) return;
    revenueByDate[date] = (revenueByDate[date] || 0) + (row.revenue_amount || 0);
  });

  const sorted = Object.entries(revenueByDate).sort(([a], [b]) => a.localeCompare(b));
  return {
    labels: sorted.map(([date]) => date),
    values: sorted.map(([, value]) => value),
  };
}

function renderDailyChart(daily) {
  const canvas = document.getElementById('chart-daily');
  if (!canvas) return;

  const rangeEl = document.getElementById('chart-date-range');
  if (rangeEl && daily.labels.length >= 2) {
    rangeEl.textContent = `${formatDate(daily.labels[0])} - ${formatDate(daily.labels[daily.labels.length - 1])}`;
  } else if (rangeEl && daily.labels.length === 1) {
    rangeEl.textContent = formatDate(daily.labels[0]);
  } else if (rangeEl) {
    rangeEl.textContent = 'No dates';
  }

  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: daily.labels.map((date) => formatDate(date)),
      datasets: [{
        data: daily.values,
        backgroundColor: 'rgba(181,98,74,0.18)',
        borderColor: '#B5624A',
        borderWidth: 1.5,
        borderRadius: 3,
        hoverBackgroundColor: 'rgba(181,98,74,0.32)',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2C1810',
          callbacks: { label: (item) => `  ${formatCurrency(item.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#A8917E', maxRotation: 45 },
        },
        y: {
          grid: { color: '#EDE4D6', drawBorder: false },
          ticks: { color: '#A8917E', callback: (value) => formatCompactCurrency(value) },
          border: { display: false },
        },
      },
    },
  });
}

function revenueByLocation(rows) {
  const revenueByLocationName = {};

  rows.forEach((row) => {
    const location = row.source_location || 'Unknown';
    revenueByLocationName[location] = (revenueByLocationName[location] || 0) + (row.revenue_amount || 0);
  });

  return Object.entries(revenueByLocationName);
}

function renderLocationChart(entries) {
  const canvas = document.getElementById('chart-location');
  if (!canvas) return;

  const labels = entries.map(([location]) => location);
  const values = entries.map(([, value]) => value);

  const metaEl = document.getElementById('chart-location-meta');
  if (metaEl) metaEl.textContent = entries.length === 1 ? '1 location' : `${entries.length} locations`;

  if (locationChart) locationChart.destroy();

  locationChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#B5624A', '#D4784A', '#A8917E', '#7A6355'],
        borderColor: '#FBF7F2',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          backgroundColor: '#2C1810',
          callbacks: { label: (item) => `  ${formatCurrency(item.parsed)}` },
        },
      },
    },
  });
}

function topItems(rows, sort, count = 10) {
  const itemsByName = {};

  rows.forEach((row) => {
    const name = row.dim_product?.item_name || 'Unknown';
    if (!itemsByName[name]) itemsByName[name] = { revenue: 0, quantity: 0 };
    itemsByName[name].revenue += row.revenue_amount || 0;
    itemsByName[name].quantity += row.quantity || 0;
  });

  return Object.entries(itemsByName)
    .sort(([, a], [, b]) => b[sort] - a[sort])
    .slice(0, count)
    .map(([name, values]) => ({ name, ...values }));
}

function renderItems(rows, sort) {
  const items = topItems(rows, sort);
  const maxValue = items[0]?.[sort] || 1;
  const body = document.getElementById('items-body');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<div class="empty-state"><strong>No data</strong>Nothing to show for this date range.</div>';
    return;
  }

  body.innerHTML = `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Item</th>
          <th class="right">${sort === 'revenue' ? 'Revenue' : 'Units Sold'}</th>
          <th class="right" style="width:100px">${sort === 'revenue' ? 'Units' : 'Revenue'}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
          <tr>
            <td class="item-rank">${index + 1}</td>
            <td>
              <div class="item-value">${item.name}</div>
              <div class="item-bar-wrap">
                <div class="item-bar" style="width:${((item[sort] / maxValue) * 100).toFixed(1)}%"></div>
              </div>
            </td>
            <td class="right item-value">
              ${sort === 'revenue' ? formatCurrency(item.revenue) : formatInteger(item.quantity)}
            </td>
            <td class="right item-sub">
              ${sort === 'revenue' ? `${formatInteger(item.quantity)} sold` : formatCurrency(item.revenue)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
