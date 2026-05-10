// Render break-risk signals from sample data.
export function renderBreakRisk(risks) {
  const el = document.getElementById('break-risk-feature');
  if (!el) return;

  el.innerHTML = `
    <div class="feature-header">
      <div class="feature-title">Break Risk</div>
      <div class="feature-meta">${risks.length} shifts</div>
    </div>
    <div class="feature-list">
      ${risks.map((risk) => `
        <div class="feature-row">
          <div>
            <div class="feature-row-main">${risk.name}</div>
            <div class="feature-row-sub">${risk.detail}</div>
          </div>
          <span class="status-pill ${risk.status}">${risk.level}</span>
        </div>
      `).join('')}
    </div>
  `;
}
