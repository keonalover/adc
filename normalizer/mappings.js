// =============================================================================
// normalizer/mappings.js
// =============================================================================
// Each POS system exports CSVs with different column names.
// This file maps each POS's raw headers → our canonical field names.
//
// Canonical sales fields:
//   transaction_id, check_id, order_id, location, order_datetime,
//   sent_datetime, hour, day_of_week, service_type, dining_option,
//   item_id, sku, item_name, category, gross_sales, discount,
//   net_sales, quantity, tax, is_void, server
//
// Map structure:
//   { canonical_field: 'POS Column Header' }
//
// Use null when the POS doesn't provide that field.
// Use '__derived__' when the field must be computed (see transform.js).
// =============================================================================


// -----------------------------------------------------------------------------
// SQUARE
// Based on: Square Item Sales report export
// Quirks:
//   - Date and Time are separate columns → combine for order_datetime
//   - No check_id or sent_datetime
//   - Voids appear as separate "Event Type: Void" rows — filtered in transform
// -----------------------------------------------------------------------------
export const SQUARE_SALES_MAP = {
  transaction_id: 'Transaction ID',
  check_id:       null,
  order_id:       'Payment ID',
  location:       'Location',
  order_datetime: '__derived__',  // combine 'Date' + 'Time' in transform
  sent_datetime:  null,
  hour:           '__derived__',  // extract from order_datetime
  day_of_week:    '__derived__',  // extract from order_datetime
  service_type:   null,
  dining_option:  'Dining Option',
  item_id:        null,
  sku:            'SKU',
  item_name:      'Item',
  category:       'Category',
  gross_sales:    'Gross Sales',
  discount:       'Discounts',
  net_sales:      'Net Sales',
  quantity:       'Qty',
  tax:            'Tax',
  is_void:        '__derived__',  // true when 'Event Type' === 'Void'
  server:         'Staff Name',
};

// Square-specific derived field logic (consumed by transform.js)
export const SQUARE_DERIVATIONS = {
  order_datetime: (row) => {
    const date = row['Date'];
    const time = row['Time'];
    if (!date) return null;
    return time ? `${date} ${time}` : date;
  },
  hour: (row) => {
    const time = row['Time'];
    if (!time) return null;
    return parseInt(time.split(':')[0], 10);
  },
  day_of_week: (row) => {
    if (!row['Date']) return null;
    return new Date(row['Date']).toLocaleDateString('en-US', { weekday: 'long' });
  },
  is_void: (row) => row['Event Type']?.toLowerCase() === 'void',
};


// -----------------------------------------------------------------------------
// TOAST
// Based on: Toast Item Selection Details export
// Quirks:
//   - 'Opened' column is the full order datetime
//   - 'Sent' is when item was sent to kitchen
//   - 'Void?' is a boolean string ('Yes'/'No' or 'TRUE'/'FALSE')
//   - 'Gross Price' = gross sales, 'Net Price' = net sales
// -----------------------------------------------------------------------------
export const TOAST_SALES_MAP = {
  transaction_id: 'transaction_id',
  check_id:       'check_id',
  order_id:       'order_id',
  location:       'location',
  order_datetime: 'order_datetime',
  sent_datetime:  'sent_datetime',
  hour:           'hour',
  day_of_week:    'day_of_week',
  service_type:   'service_type',
  dining_option:  'dining_option',
  item_id:        'item_id',
  sku:            'sku',
  item_name:      'item_name',
  category:       'category',
  gross_sales:    'gross_sales',
  discount:       'discount',
  net_sales:      'net_sales',
  quantity:       'quantity',
  tax:            'tax',
  is_void:        'is_void',
  server:         'server',
};

export const TOAST_DERIVATIONS = {};


// -----------------------------------------------------------------------------
// CLOVER
// Based on: Clover Orders export
// Quirks:
//   - No check_id, sent_datetime, dining_option, item_id, sku, category, discount
//   - 'Price' is used for both gross and net (no discount data in item export)
//   - 'Time' is full datetime
//   - Employee name → server
// -----------------------------------------------------------------------------
export const CLOVER_SALES_MAP = {
  transaction_id: 'Order ID',
  check_id:       null,
  order_id:       'Order ID',
  location:       null,           // not in export — use location_id from context
  order_datetime: 'Time',
  sent_datetime:  null,
  hour:           '__derived__',
  day_of_week:    '__derived__',
  service_type:   'Payment Type',
  dining_option:  null,
  item_id:        null,
  sku:            null,
  item_name:      'Item',
  category:       null,
  gross_sales:    'Price',
  discount:       null,
  net_sales:      'Price',
  quantity:       'Qty',
  tax:            'Tax',
  is_void:        null,           // not exported — treat all rows as valid
  server:         'Employee',
};

export const CLOVER_DERIVATIONS = {
  hour: (row) => {
    const dt = row['Time'];
    if (!dt) return null;
    return new Date(dt).getHours();
  },
  day_of_week: (row) => {
    const dt = row['Time'];
    if (!dt) return null;
    return new Date(dt).toLocaleDateString('en-US', { weekday: 'long' });
  },
};


// -----------------------------------------------------------------------------
// Registry — look up by pos_source string
// -----------------------------------------------------------------------------
export const POS_MAPS = {
  square: { map: SQUARE_SALES_MAP, derivations: SQUARE_DERIVATIONS },
  toast:  { map: TOAST_SALES_MAP,  derivations: TOAST_DERIVATIONS  },
  clover: { map: CLOVER_SALES_MAP, derivations: CLOVER_DERIVATIONS },
};
