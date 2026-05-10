// =============================================================================
// normalizer/transform.js
// =============================================================================
// Pure utility functions for cleaning and coercing raw CSV values.
// No POS-specific logic lives here — that belongs in mappings.js.
// =============================================================================


// -----------------------------------------------------------------------------
// Currency → float
// Handles: '$1,234.56', '(12.50)', '-$12.50', '1234.56', '', null
// -----------------------------------------------------------------------------
export function parseCurrency(value) {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).trim();
  // Parentheses = negative (accounting format)
  const isNegative = str.startsWith('(') || str.startsWith('-');
  const cleaned = str.replace(/[$,() -]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}


// -----------------------------------------------------------------------------
// Quantity → float
// Handles: '2', '1.5', '', null
// -----------------------------------------------------------------------------
export function parseQuantity(value) {
  if (value === null || value === undefined || value === '') return 1;
  const num = parseFloat(String(value).trim());
  return isNaN(num) ? 1 : num;
}


// -----------------------------------------------------------------------------
// Boolean → bool
// Handles: 'Yes', 'No', 'TRUE', 'FALSE', '1', '0', true, false, null
// -----------------------------------------------------------------------------
export function parseBoolean(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'boolean') return value;
  const str = String(value).trim().toLowerCase();
  return ['yes', 'true', '1'].includes(str);
}


// -----------------------------------------------------------------------------
// Datetime string → ISO 8601 string (UTC-normalized)
// Handles most formats: 'Jan 15, 2024 2:30 PM', '2024-01-15 14:30:00',
//                       '01/15/2024 2:30 PM', '2024-01-15T14:30:00'
// Returns null on failure — caller decides how to handle.
// -----------------------------------------------------------------------------
export function parseDateTime(value) {
  if (!value) return null;
  const str = String(value).trim();
  
  // Normalize space-separated datetime → ISO format (e.g. '2026-04-20 10:19:00')
  const normalized = str.replace(' ', 'T');
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Fallback: MM/DD/YYYY HH:MM
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)$/);
  if (match) {
    const [, m, day, year, time] = match;
    const d2 = new Date(`${year}-${m.padStart(2,'0')}-${day.padStart(2,'0')}T${time}`);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }
  return null;
}


// -----------------------------------------------------------------------------
// Extract YYYY-MM-DD date string from a datetime value
// Used to populate date_id (FK into dim_date)
// -----------------------------------------------------------------------------
export function extractDate(value) {
  const iso = parseDateTime(value);
  if (!iso) return null;
  return iso.slice(0, 10); // 'YYYY-MM-DD'
}


// -----------------------------------------------------------------------------
// Normalize a raw CSV row using a POS map + derivation functions
//
// Returns a canonical row object with all fields from our internal schema.
// Fields that can't be resolved are set to null.
// -----------------------------------------------------------------------------
export function applyMapping(rawRow, posMap, derivations = {}) {
  const canonical = {};

  for (const [field, sourceCol] of Object.entries(posMap)) {
    if (sourceCol === null) {
      canonical[field] = null;
    } else if (sourceCol === '__derived__') {
      const fn = derivations[field];
      canonical[field] = fn ? fn(rawRow) : null;
    } else {
      canonical[field] = rawRow[sourceCol] ?? null;
    }
  }

  return canonical;
}


// -----------------------------------------------------------------------------
// Coerce a canonical row's types into what the DB expects
// Call this AFTER applyMapping()
// -----------------------------------------------------------------------------
export function coerceTypes(canonical) {
  return {
    ...canonical,
    gross_sales:    parseCurrency(canonical.gross_sales),
    discount:       parseCurrency(canonical.discount),
    net_sales:      parseCurrency(canonical.net_sales),
    tax:            parseCurrency(canonical.tax),
    quantity:       parseQuantity(canonical.quantity),
    is_void:        parseBoolean(canonical.is_void),
    order_datetime: parseDateTime(canonical.order_datetime),
    sent_datetime:  parseDateTime(canonical.sent_datetime),
    hour:           canonical.hour !== null ? parseInt(canonical.hour, 10) : null,
  };
}


// -----------------------------------------------------------------------------
// Map a coerced canonical row → warehouse.fact_sales shape
// location_id, client_id, batch_id are passed in from context (not in CSV)
// -----------------------------------------------------------------------------
export function toFactSalesRow(canonical, { locationId, clientId, batchId, index }) {
  // Skip voided rows entirely — they'd skew all metrics
  if (canonical.is_void) return null;

  const dateId = extractDate(canonical.order_datetime);
  if (!dateId) return null; // can't insert without a valid date

  return {
    date_id:          dateId,
    location_id:      locationId,
    client_id:        clientId,
    batch_id:         batchId,
    transaction_id:   canonical.transaction_id || null,
    line_item_index:  index,
    transaction_time: canonical.order_datetime  || null,
    quantity:         canonical.quantity,
    unit_price:       canonical.quantity > 0
                        ? +(canonical.gross_sales / canonical.quantity).toFixed(4)
                        : null,
    gross_sales:      canonical.gross_sales,
    discounts:        Math.abs(canonical.discount),  // store as positive
    net_sales:        canonical.net_sales,
    tax:              canonical.tax,
    tips:             0,     // not in item-level exports — handled at order level
    refunds:          0,
    payment_method:   canonical.service_type || null,
  };
}


// -----------------------------------------------------------------------------
// Map a coerced canonical row → warehouse.dim_product shape (for upsert)
// Returns null if there's not enough info to identify a product
// -----------------------------------------------------------------------------
export function toProductRow(canonical, { locationId, clientId }) {
  if (!canonical.item_name) return null;

  return {
    client_id:   clientId,
    location_id: locationId,
    pos_item_id: canonical.item_id || null,
    item_name:   canonical.item_name.trim(),
    category:    canonical.category || null,
  };
}
