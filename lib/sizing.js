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

// Build the size-sequence string (e.g. "S-L", "X-OB") from a line of nodes.
// One token per street up to and including the last street that has a bet:
// bet streets use their first bet's token (or '?' when its size is unpicked),
// checked-through streets in between are X. Returns null when no street has a
// bet, since there's no sequence to infer yet.
export function inferSizeSequence(line) {
  if (!Array.isArray(line)) return null;
  const STREETS = ['flop', 'turn', 'river'];
  const byStreet = STREETS.map(s => line.filter(n => !n.marker && n.street === s));

  let lastBet = -1;
  byStreet.forEach((nodes, i) => { if (nodes.some(n => n.action === 'bet')) lastBet = i; });
  if (lastBet < 0) return null;

  const tokens = [];
  for (let i = 0; i <= lastBet; i++) {
    const firstBet = byStreet[i].find(n => n.action === 'bet');
    tokens.push(firstBet ? (sizeToken(firstBet.sizing) || '?') : 'X');
  }
  return tokens.join('-');
}
