// Render inventory watchlist rows from sample data.
export function renderInventory(items) {
  const el = document.getElementById('inventory-feature');
  if (!el) return;

  el.innerHTML = `
    <div class="feature-header">
      <div class="feature-title">Inventory</div>
      <div class="feature-meta">${items.length} watched items</div>
    </div>
    <table class="simple-table">
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">On Hand</th>
          <th class="right">Need</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${item.item}</td>
            <td class="right">${item.onHand}</td>
            <td class="right">${item.need}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
