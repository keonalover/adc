import { formatCurrency, formatInteger } from '../utils/formatters.js';

// Render the labor summary card from sample data.
export function renderLabor(data) {
  const el = document.getElementById('labor-feature');
  if (!el) return;

  el.innerHTML = `
    <div class="feature-header">
      <div class="feature-title">Labor</div>
      <div class="feature-meta">${data.laborPercent}% of sales</div>
    </div>
    <table class="simple-table">
      <tbody>
        <tr>
          <td>Scheduled hours</td>
          <td class="right">${formatInteger(data.scheduledHours)}</td>
        </tr>
        <tr>
          <td>Actual hours</td>
          <td class="right">${formatInteger(data.actualHours)}</td>
        </tr>
        <tr>
          <td>Labor cost</td>
          <td class="right">${formatCurrency(data.laborCost)}</td>
        </tr>
      </tbody>
    </table>
  `;
}
