// Bet-size bucketing, mirroring the snapmda exporter's "Size Sequence" rules.
// Thresholds (https://docs.snapmda.com/sizes): each street is classified by its
// *first bet size* as a % of pot —
//   X = street checks through, S = 0-45%, M = 45-70%, L = 70-105%, OB = 105%+
//
// Pickable presets cover every bucket; the inferred token comes from the %,
// not from the user picking a bucket directly.
export const SIZE_PRESETS = [25, 33, 50, 66, 75, 100, 125, 150, 200];

// Map a bet size (% of pot) to its sequence token. Returns null when no size
// has been picked (sizing 0 / nullish) so callers can show a placeholder.
export function sizeToken(pct) {
  if (pct == null || pct === 0) return null;
  if (pct < 45) return 'S';
  if (pct < 70) return 'M';
  if (pct < 105) return 'L';
  return 'OB';
}

const STREETS = ['flop', 'turn', 'river'];

// The street of the bet the actor is about to consider (when on a check/bet
// frontier). After a call or check-through the action moves to the next street;
// a lone check (opponent checked to us) leaves us on the same street. Returns
// null at the root's last street with nowhere to go.
export function prospectiveBetStreet(line) {
  const nodes = Array.isArray(line) ? line.filter(n => !n.marker) : [];
  if (!nodes.length) return 'flop';
  const last = nodes[nodes.length - 1];
  const idx = STREETS.indexOf(last.street);
  const checksThisStreet = nodes.filter(n => n.street === last.street && n.action === 'check').length;
  const completed = last.action === 'call' || (last.action === 'check' && checksThisStreet >= 2);
  return completed ? (STREETS[idx + 1] ?? null) : last.street;
}

// Build a per-street size-sequence *pattern* from a line of nodes. Each entry is
//   - a token (S/M/L/OB) when that street's first bet has a picked size,
//   - 'X' for a checked-through street, or
//   - null (a wildcard — matches any token when filtering) when the street has a
//     bet whose size isn't picked yet, OR for the prospective bet street.
//
// Covers streets up to the last committed bet. Pass `prospectiveStreet` (the
// street of a not-yet-made bet, from prospectiveBetStreet) to extend the pattern
// through it with a trailing wildcard — so while choosing a river size after an
// "S-M" line, the pattern is ["S","M",null] ("S-M-*") and matches every S-M-*
// row. Returns null when there's neither a committed bet nor a prospective one.
export function inferSizeSeqPattern(line, prospectiveStreet = null) {
  if (!Array.isArray(line)) return null;
  const byStreet = STREETS.map(s => line.filter(n => !n.marker && n.street === s));

  let lastBet = -1;
  byStreet.forEach((nodes, i) => { if (nodes.some(n => n.action === 'bet')) lastBet = i; });
  const decisionIdx = prospectiveStreet ? STREETS.indexOf(prospectiveStreet) : -1;
  const end = Math.max(lastBet, decisionIdx);
  if (end < 0) return null;

  const pattern = [];
  for (let i = 0; i <= end; i++) {
    const firstBet = byStreet[i].find(n => n.action === 'bet');
    if (firstBet) pattern.push(sizeToken(firstBet.sizing) || null);
    else if (i === decisionIdx) pattern.push(null); // prospective bet → wildcard
    else pattern.push('X'); // checked through
  }
  return pattern;
}

// Build the size-sequence string (e.g. "S-L", "X-OB") from a line of nodes.
// Unpicked bet sizes render as '?'. Returns null when no street has a bet.
export function inferSizeSequence(line) {
  const pattern = inferSizeSeqPattern(line);
  return pattern ? pattern.map(p => p ?? '?').join('-') : null;
}

// Does a Size-Sequence row label (e.g. "S-L-OB") fit the picked pattern?
// Same length required; null pattern entries are wildcards. A null pattern
// (nothing picked) matches everything.
export function matchesSizeSeq(label, pattern) {
  if (!pattern) return true;
  const toks = label.split('-');
  if (toks.length !== pattern.length) return false;
  return pattern.every((p, i) => p == null || p === toks[i]);
}

// Human-readable pattern, wildcards shown as '*' (e.g. "L-*-*").
export function patternLabel(pattern) {
  return pattern ? pattern.map(p => p ?? '*').join('-') : '';
}
