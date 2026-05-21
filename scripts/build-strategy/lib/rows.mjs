// Row indexing helpers. Each blob's data[] is a flat list of (metric, value)
// slices. These helpers pull the slices we care about.

export function findOverall(rows) {
  return rows.find(r => r.metric === 'Overall');
}

export function sizeRows(rows) {
  return rows.filter(r => r.metric === 'Size' && r.value !== 'Overall' && (r.hits || 0) > 0);
}

export function textureRows(rows) {
  return rows.filter(r => r.metric === 'Texture' && r.value !== 'Overall');
}

export function archetypeRows(rows) {
  return rows.filter(r => r.metric === 'Archetype' && r.value !== 'Overall' && r.value !== '' && r.value !== 'Average');
}

// True if this file represents a node where perspective took a *bet* action
// on the most-recent street (last segment of the line ends with B alone).
// Lines like "B-B-B" -> perspective bet river. "B-B-BF" -> terminal fold (not a bet decision).
export function isPerspectiveBetTerminal(line) {
  const last = line.split('-').pop();
  return last === 'B' || last === 'XB' || last === 'XRB' || last === 'XCB';
}

// "B-B-B" -> 'river' bet, "B-B" -> 'turn', "B" -> 'flop'.
const STREETS = ['flop', 'turn', 'river'];
export function streetForLine(line) {
  const segs = line.split('-').length;
  return STREETS[segs - 1] ?? null;
}

export function confidenceLabel(sample) {
  if (sample >= 1000) return 'high';
  if (sample >= 100)  return 'medium';
  return 'low';
}

// Pool's same-street response counts, normalised across action types.
// Bet rows use BF/BC/BR keys; raise rows use RF/RC/RR. Dashed keys (B-B, etc.)
// are next-street openings, not same-street responses.
export function parseResponseCounts(nextActions) {
  const next = nextActions || {};
  let f = 0, c = 0, r = 0;
  for (const [k, v] of Object.entries(next)) {
    if (k.includes('-')) continue;
    if (k.endsWith('F')) f += v;
    else if (k.endsWith('C')) c += v;
    else if (k.endsWith('R') || k.endsWith('B')) r += v;
  }
  const total = f + c + r;
  return {
    fold: total ? f / total : 0,
    call: total ? c / total : 0,
    raise: total ? r / total : 0,
    sample: total,
  };
}
