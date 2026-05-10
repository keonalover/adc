// Render a short operator-facing action list.
export function renderWeeklyActions(actions) {
  const el = document.getElementById('weekly-actions-feature');
  if (!el) return;

  el.innerHTML = `
    <div class="feature-header">
      <div class="feature-title">Weekly Actions</div>
      <div class="feature-meta">${actions.length} suggestions</div>
    </div>
    <div class="feature-list">
      ${actions.map((action, index) => `
        <div class="feature-row">
          <div>
            <div class="feature-row-main">${index + 1}. ${action}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
