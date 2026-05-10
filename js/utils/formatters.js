// Shared display helpers. Keep formatting here so feature files stay focused.
export function formatCurrency(value) {
  const number = Number(value) || 0;
  return '$' + number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactCurrency(value) {
  const number = Number(value) || 0;
  return number >= 1000 ? '$' + (number / 1000).toFixed(1) + 'k' : '$' + number.toFixed(0);
}

export function formatInteger(value) {
  return (Number(value) || 0).toLocaleString('en-US');
}

export function formatDate(value) {
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
