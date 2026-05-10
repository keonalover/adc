// =============================================================================
// normalizer/pipeline.js
// =============================================================================
// Orchestrates the full CSV ingestion flow:
//   1. Parse CSV (PapaParse)
//   2. Create upload batch record
//   3. Insert raw JSONB rows → raw.sales_uploads
//   4. Map + coerce → canonical rows
//   5. Upsert products → warehouse.dim_product (discover new items)
//   6. Upsert fact rows → warehouse.fact_sales
//   7. Update batch status
//
// Usage:
//   import { runSalesPipeline } from './pipeline.js';
//   const result = await runSalesPipeline({
//     csvText,          // raw CSV string (from FileReader)
//     posSource,        // 'square' | 'toast' | 'clover'
//     locationId,       // UUID from warehouse.dim_location
//     clientId,         // UUID from warehouse.clients
//     filename,         // original filename (for audit)
//     uploadedBy,       // email of uploader
//     supabase,         // Supabase JS client instance
//     onProgress,       // optional (pct: number) => void callback
//   });
// =============================================================================

import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';
import { POS_MAPS } from './mappings.js';
import { applyMapping, coerceTypes, toFactSalesRow, toProductRow } from './transform.js';


// How many rows to insert per Supabase batch call.
// Supabase has a ~1MB payload limit; 200 rows is safe for most schemas.
const BATCH_SIZE = 200;


// =============================================================================
// Main entry point
// =============================================================================
export async function runSalesPipeline({
  csvText,
  posSource,
  locationId,
  clientId,
  filename,
  uploadedBy,
  supabase,
  onProgress = () => {},
}) {
  const posKey = posSource.toLowerCase();
  const posConfig = POS_MAPS[posKey];

  if (!posConfig) {
    throw new Error(`Unknown POS source: "${posSource}". Expected: square, toast, clover`);
  }

  // ── 1. Parse CSV ────────────────────────────────────────────────────────────
  onProgress(5);
  const { data: rawRows, errors: parseErrors } = Papa.parse(csvText, {
    header:        true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),  // strip whitespace from column names
  });

  if (parseErrors.length > 0) {
    console.warn('CSV parse warnings:', parseErrors);
  }

  if (rawRows.length === 0) {
    throw new Error('CSV file is empty or has no data rows.');
  }

  // ── 2. Create upload batch ──────────────────────────────────────────────────
  onProgress(10);
  const { data: batch, error: batchError } = await supabase
    .schema('raw')
    .from('upload_batches')
    .insert({
      client_id:   clientId,
      location_id: locationId,
      pos_source:  posKey,
      domain:      'sales',
      filename:    filename || null,
      row_count:   rawRows.length,
      status:      'processing',
      uploaded_by: uploadedBy || null,
    })
    .select('batch_id')
    .single();

  if (batchError) throw new Error(`Failed to create batch: ${batchError.message}`);
  const batchId = batch.batch_id;

  try {
    // ── 3. Insert raw JSONB rows ──────────────────────────────────────────────
    onProgress(20);
    const rawInsertRows = rawRows.map((row) => ({
      batch_id:    batchId,
      location_id: locationId,
      pos_source:  posKey,
      raw_data:    row,         // whole row stored as JSONB
    }));

    const rawErrors = await batchInsert(supabase, 'raw', 'sales_uploads', rawInsertRows);
    if (rawErrors.length > 0) {
      console.warn('Some raw rows failed to insert:', rawErrors);
    }

    // ── 4. Map + coerce canonical rows ────────────────────────────────────────
    onProgress(40);
    const { map, derivations } = posConfig;
    const canonicalRows = rawRows.map((row) => {
      const mapped = applyMapping(row, map, derivations);
      return coerceTypes(mapped);
    });

    // ── 5. Upsert products (discover new menu items) ──────────────────────────
    onProgress(55);
    const productRows = canonicalRows
      .map((r) => toProductRow(r, { locationId, clientId }))
      .filter(Boolean);

    // Deduplicate by item_name + location before upserting
    const uniqueProducts = deduplicateBy(productRows, (r) => `${r.location_id}::${r.item_name}`);

    if (uniqueProducts.length > 0) {
      const { error: productError } = await supabase
        .schema('warehouse')
        .from('dim_product')
        .upsert(uniqueProducts, {
          onConflict:        'location_id, pos_item_id',
          ignoreDuplicates:  true,
        });
      if (productError) console.warn('Product upsert warning:', productError.message);
    }

    // ── 5b. Fetch product_id map (item_name → uuid) for this location ─────────
    const { data: products } = await supabase
      .schema('warehouse')
      .from('dim_product')
      .select('product_id, item_name')
      .eq('location_id', locationId);

    const productIdByName = Object.fromEntries(
      (products || []).map((p) => [p.item_name.toLowerCase(), p.product_id])
    );

    // ── 6. Build + upsert fact_sales rows ─────────────────────────────────────
    onProgress(70);
    const factRows = canonicalRows
      .map((r, i) => {
        const row = toFactSalesRow(r, { locationId, clientId, batchId, index: i });

        // DEBUG — log exactly why rows are dropped
        if (!row) {
          console.log('❌ dropped row:', {
            is_void:        r.is_void,
            order_datetime: r.order_datetime,
            item_name:      r.item_name,
            transaction_id: r.transaction_id,
          });
        }

        if (!row) return null;
        const key = r.item_name?.toLowerCase();
        row.product_id = key ? (productIdByName[key] || null) : null;
        return row;
      })
      .filter(Boolean);

    const factErrors = await batchInsert(
      supabase,
      'warehouse',
      'fact_sales',
      factRows,
      { upsert: true, onConflict: 'location_id,transaction_id,product_id,line_item_index' }
    );

    // ── 7. Update batch status ─────────────────────────────────────────────────
    onProgress(95);
    const hadErrors = rawErrors.length > 0 || factErrors.length > 0;
    await supabase
      .schema('raw')
      .from('upload_batches')
      .update({
        status:       hadErrors ? 'completed' : 'completed', // future: 'completed_with_warnings'
        completed_at: new Date().toISOString(),
        error_log:    hadErrors
          ? JSON.stringify([...rawErrors, ...factErrors].slice(0, 50))
          : null,
        date_start: factRows.reduce((min, r) => (!min || r.date_id < min ? r.date_id : min), null),
        date_end:   factRows.reduce((max, r) => (!max || r.date_id > max ? r.date_id : max), null),
      })
      .eq('batch_id', batchId);

    // Mark raw rows as processed
    await supabase
      .schema('raw')
      .from('sales_uploads')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('batch_id', batchId);

    onProgress(100);

    return {
      batchId,
      totalRows:    rawRows.length,
      factsInserted: factRows.length,
      voidedSkipped: rawRows.length - canonicalRows.filter((r) => !r.is_void).length,
      warnings:     [...rawErrors, ...factErrors],
    };

  } catch (err) {
    // Mark batch as failed
    await supabase
      .schema('raw')
      .from('upload_batches')
      .update({ status: 'failed', error_log: JSON.stringify([{ message: err.message }]) })
      .eq('batch_id', batchId);
    throw err;
  }
}


// =============================================================================
// Helpers
// =============================================================================

// Insert rows in chunks to stay under Supabase payload limits
async function batchInsert(supabase, schema, table, rows, options = {}) {
  const errors = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const query = supabase.schema(schema).from(table);
    const { error } = options.upsert
      ? await query.upsert(chunk, { onConflict: options.onConflict, ignoreDuplicates: true })
      : await query.insert(chunk);
    if (error) {
      console.error(`❌ batchInsert error [${schema}.${table}]:`, error.message, error.details, error.hint);  // ADD THIS
      errors.push({ chunk_start: i, message: error.message });
    }
  }
  return errors;
}

// Deduplicate an array by a key function (keeps first occurrence)
function deduplicateBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
