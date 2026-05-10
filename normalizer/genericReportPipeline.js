import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

const BATCH_SIZE = 200;

export async function runGenericReportPipeline({
  csvText,
  reportType,
  sourceSystem,
  locationId,
  clientId,
  filename,
  uploadedBy,
  supabase,
  onProgress = () => {},
}) {
  const domain = String(reportType || '').trim().toLowerCase();
  if (!domain) throw new Error('Select a report type before uploading.');

  onProgress(5);
  const { data: rawRows, errors: parseErrors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parseErrors.length > 0) console.warn('CSV parse warnings:', parseErrors);
  if (!rawRows.length) throw new Error('CSV file is empty or has no data rows.');

  onProgress(15);
  const { data: batch, error: batchError } = await supabase
    .schema('raw')
    .from('upload_batches')
    .insert({
      client_id: clientId,
      location_id: locationId,
      pos_source: sourceSystem || domain,
      domain,
      filename: filename || null,
      row_count: rawRows.length,
      status: 'processing',
      uploaded_by: uploadedBy || null,
    })
    .select('batch_id')
    .single();

  if (batchError) throw new Error(`Failed to create batch: ${batchError.message}`);

  const batchId = batch.batch_id;
  const rows = rawRows.map((row, index) => ({
    batch_id: batchId,
    client_id: clientId,
    location_id: locationId,
    report_type: domain,
    source_system: sourceSystem || null,
    row_index: index,
    raw_data: row,
  }));

  try {
    onProgress(45);
    await batchInsert(supabase, rows);

    onProgress(90);
    await supabase
      .schema('raw')
      .from('upload_batches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('batch_id', batchId);

    onProgress(100);
    return {
      batchId,
      totalRows: rawRows.length,
      stagedRows: rows.length,
      reportType: domain,
    };
  } catch (error) {
    await supabase
      .schema('raw')
      .from('upload_batches')
      .update({ status: 'failed', error_log: JSON.stringify([{ message: error.message }]) })
      .eq('batch_id', batchId);
    throw error;
  }
}

async function batchInsert(supabase, rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.schema('raw').from('report_uploads').insert(chunk);
    if (error) throw new Error(`Failed to stage rows: ${error.message}`);
  }
}
