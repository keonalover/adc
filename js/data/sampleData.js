// Demo data for dashboard features that are not connected to Supabase yet.
export const sampleData = {
  labor: {
    scheduledHours: 182,
    actualHours: 176,
    laborCost: 3120,
    laborPercent: 28.4,
  },
  breakRisk: [
    { name: 'Morning shift', detail: '2 people near 5-hour mark', level: 'Watch', status: 'warn' },
    { name: 'Afternoon shift', detail: 'Coverage looks balanced', level: 'Clear', status: 'good' },
    { name: 'Closing shift', detail: '1 missed-break risk', level: 'Watch', status: 'warn' },
  ],
  inventory: [
    { item: 'Cold brew concentrate', onHand: '2.5 gal', need: 'Order soon' },
    { item: 'Oat milk', onHand: '9 cartons', need: 'Healthy' },
    { item: 'Croissants', onHand: '18 units', need: 'Prep extra' },
  ],
  weeklyActions: [
    'Review discount-heavy orders from last week.',
    'Schedule one extra closer for Friday.',
    'Reorder cold brew concentrate before the weekend.',
  ],
};
