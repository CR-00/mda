function normalizeNext(nextActions) {
  if (!nextActions) return { bf: 0.6, bc: 0.35, br: 0.05, hasBR: false };
  // Response keys are always length 2 — BF/BC/BR (vs bet) or RF/RC/RR (vs raise).
  // snap exports also include compound keys like 'B-F', 'B-X' that track the
  // response followed by a downstream action; those must be ignored or the
  // suffix-match below picks 'B-F' instead of 'BF' and reports wildly wrong
  // fold/call/raise frequencies.
  const responseKeys = Object.keys(nextActions).filter(k => k.length === 2);
  const foldKey  = responseKeys.find(k => k.endsWith('F'));
  const callKey  = responseKeys.find(k => k.endsWith('C'));
  const raiseKey = responseKeys.find(k => k !== foldKey && k !== callKey);
  const bf = foldKey  ? nextActions[foldKey]  : 0;
  const bc = callKey  ? nextActions[callKey]  : 0;
  const br = raiseKey ? nextActions[raiseKey] : 0;
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
  const callEV = (row.catchVevPct ?? 0) * (row.pot ?? 0);
  // bluffVev is already in BB (normalized per fold-hand); use directly when present.
  const bluffEV = row.action === 'F' && row.bluffVev != null
    ? row.bluffVev
    : (next.bf - next.bc * sizeRatio) * (row.pot ?? 0);
  return {
    label: (row.value ?? row.metric ?? '').trim(),
    sample: row.hits ?? 0,
    ofN: row.opps ?? 0,
    freq: row.freq ?? 0,
    bluffPct: row.bluff ?? 0,
    bluffEV,
    avgSize: sizeRatio * 100,
    potSize: row.pot ?? 0,
    next,
    callEV,
    sizeRatio,
  };
}

// Returns { overall, rows } for the bet-size or texture table.
// Prefers a value='Overall' row within metricKey over the global metric='Overall' row,
// so e.g. 'Vs. Raise Size' can supply its own aggregate stats.
export function adaptTableData(rawRows, metricKey) {
  const metricRows = rawRows.filter(r => r.metric === metricKey);
  const metricOverall = metricRows.find(r => r.value === 'Overall');
  const globalOverall = rawRows.find(r => r.metric === 'Overall');
  const overall = metricOverall || globalOverall;
  const rows = metricRows.filter(r => r.value !== 'Overall');
  if (!overall) return null;
  return {
    overall: adaptRow(overall),
    rows: rows.map(adaptRow),
  };
}

// Pseudo-count for the size-sequence shrinkage weight. A sequence needs this
// many hands to count for half its full effect (w = n / (n + PRIOR)); smaller
// samples are pulled back toward the baseline. Tuned so the UI's "low sample"
// threshold (~200) lands around a third of full weight, and multi-thousand-hand
// sequences are trusted almost fully.
export const SIZE_SEQ_PRIOR = 500;

const SEQ_STATS = ['freq', 'bluffPct', 'bluffEV', 'avgSize', 'potSize', 'callEV', 'sizeRatio'];

/**
 * Fold a *hierarchy* of sizing signals into an already board-adjusted row.
 *
 * The signals overlap (the full path's last street is a particular bet size),
 * so we can't sum independent deltas — that double-counts the bet-size effect.
 * Instead each level is a refinement of the one above it:
 *
 *   overall → board (textureDelta, applied already) → exact bet size → full path
 *
 * and contributes only its deviation *from its parent*, weighted by its own
 * sample (w = n / (n + prior)). So the large-sample "size" row supplies the
 * fine bet-size read (its deviation from overall), and the smaller "path" row
 * adds just the multi-street pattern beyond that size (its deviation from the
 * size row). Pass `levels` ordered coarse→fine; the first level's parent is
 * `baseline`, each later level's parent is the previous level's row.
 *
 * Each level: { row, sample, label?, kind? }. Missing/empty levels are skipped.
 * Returns { row, weight, signals } — weight is the strongest level's w (0 when
 * nothing applied); signals echoes each applied level with its w for the UI.
 *
 * adjusted: board-adjusted overall (from computeBoardAdjusted)
 * baseline: the plain Overall row (root of the hierarchy)
 */
export function applySizeSignals(adjusted, baseline, levels, prior = SIZE_SEQ_PRIOR) {
  const lv = (levels || []).filter(l => l && l.row && l.sample > 0);
  if (!adjusted || !baseline || lv.length === 0) return { row: adjusted, weight: 0, signals: [] };

  const out = { ...adjusted };
  const nextOut = { bf: adjusted.next.bf, bc: adjusted.next.bc, br: adjusted.next.br };

  let parent = baseline;
  const signals = [];
  for (const l of lv) {
    const w = l.sample / (l.sample + prior);
    for (const stat of SEQ_STATS) out[stat] += w * (l.row[stat] - parent[stat]);
    for (const k of ['bf', 'bc', 'br']) nextOut[k] += w * (l.row.next[k] - parent.next[k]);
    signals.push({ label: l.label, kind: l.kind, sample: l.sample, w });
    parent = l.row;
  }

  for (const k of ['bf', 'bc', 'br']) nextOut[k] = Math.max(0, nextOut[k]);
  const t = nextOut.bf + nextOut.bc + nextOut.br || 1;
  out.next = {
    bf: nextOut.bf / t,
    bc: nextOut.bc / t,
    br: nextOut.br / t,
    hasBR: (nextOut.br / t) > 0.01,
  };

  return { row: out, weight: Math.max(...signals.map(s => s.w)), signals };
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
