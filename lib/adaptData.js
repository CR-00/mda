function normalizeNext(nextActions) {
  if (!nextActions) return { bf: 0.6, bc: 0.35, br: 0.05, hasBR: false };
  const bf = nextActions.BF ?? 0;
  const bc = nextActions.BC ?? 0;
  const br = nextActions.BR ?? 0;
  const total = bf + bc + br || 1;
  return {
    bf: bf / total,
    bc: bc / total,
    br: br / total,
    hasBR: br > 0,
  };
}

function adaptRow(row) {
  const sizeRatio = row.pctPot ?? 0;
  const next = normalizeNext(row.nextActions);
  return {
    label: (row.value ?? row.metric ?? '').trim(),
    sample: row.hits ?? 0,
    ofN: row.opps ?? 0,
    freq: row.freq ?? 0,
    bluffPct: row.bluff ?? 0,
    bluffEV: row.bluffVevPct ? row.bluffVevPct * 100 : (next.bf - next.bc * sizeRatio) * 100,
    avgSize: sizeRatio * 100,
    potSize: row.pot ?? 0,
    next,
    callEV: (row.catchVevPct ?? 0) * 100,
    sizeRatio,
  };
}

// Returns { overall, rows } for the bet-size or texture table
// metricKey: 'Size' for size breakdown, 'Texture' for texture breakdown
export function adaptTableData(rawRows, metricKey) {
  const overall = rawRows.find(r => r.metric === 'Overall');
  const rows = rawRows.filter(r => r.metric === metricKey);
  if (!overall) return null;
  return {
    overall: adaptRow(overall),
    rows: rows.map(adaptRow),
  };
}

/**
 * Produce a board-adjusted overall row by applying inverse-opps-weighted
 * deltas from each matched texture onto the Overall baseline.
 *
 * Texture rows overlap (a board matches several simultaneously), so we must
 * not average raw values — that double-counts shared hands. Instead we work
 * in delta-space: each texture contributes a deviation from Overall, weighted
 * by 1/opps (more specific texture → fewer boards have it → higher weight).
 *
 * overall:      adaptRow output for the Overall row
 * matchingRows: adaptRow outputs for the board's matched texture labels
 */
export function computeBoardAdjusted(overall, matchingRows) {
  if (!matchingRows || matchingRows.length === 0) return overall;

  // 1. Inverse-opps weights, normalized
  const rawWeights = matchingRows.map(r => 1 / Math.max(r.ofN, 1));
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map(w => w / totalWeight);

  // 2. Weighted delta for each scalar stat
  const STATS = ['freq', 'bluffPct', 'bluffEV', 'avgSize', 'potSize', 'callEV', 'sizeRatio'];
  const adjusted = { ...overall, label: 'This board' };
  for (const stat of STATS) {
    const delta = weights.reduce((sum, w, i) => sum + w * (matchingRows[i][stat] - overall[stat]), 0);
    adjusted[stat] = overall[stat] + delta;
  }

  // 3. Same delta logic for next-action proportions, then renormalize
  const nextAdj = {};
  for (const k of ['bf', 'bc', 'br']) {
    const delta = weights.reduce((sum, w, i) => sum + w * (matchingRows[i].next[k] - overall.next[k]), 0);
    nextAdj[k] = Math.max(0, overall.next[k] + delta);
  }
  const nextTotal = nextAdj.bf + nextAdj.bc + nextAdj.br || 1;
  adjusted.next = {
    bf: nextAdj.bf / nextTotal,
    bc: nextAdj.bc / nextTotal,
    br: nextAdj.br / nextTotal,
    hasBR: (nextAdj.br / nextTotal) > 0.01,
  };

  // 4. Conservative sample estimate: minimum across matched textures
  adjusted.sample = Math.min(...matchingRows.map(r => r.sample));
  adjusted.ofN = Math.min(...matchingRows.map(r => r.ofN));

  return adjusted;
}
