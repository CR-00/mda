// Snap MDA exports `data` (and `compareData`) either as an array of row objects
// (legacy) or column-oriented as { n, cols: { field: [v0, v1, ...] } }. The app
// works on rows, so convert columnar tables back; arrays pass through unchanged.
export function toRows(table) {
  if (Array.isArray(table) || !table?.cols) return table;
  const fields = Object.keys(table.cols);
  const n = table.n ?? table.cols[fields[0]]?.length ?? 0;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const f of fields) row[f] = table.cols[f][i];
    rows[i] = row;
  }
  return rows;
}

export function normalizeSnapBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body, data: toRows(body.data) };
  if (body.compareData !== undefined) out.compareData = toRows(body.compareData);
  return out;
}
