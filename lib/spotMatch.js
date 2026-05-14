const ACTION_TO_LETTER = {
  bet: 'B',
  check: 'X',
  call: 'C',
  fold: 'F',
  raise: 'R',
};

const STREETS = ['flop', 'turn', 'river'];

/**
 * Derive the query line string (e.g. "B-B-B" or "XC-X-B") from the line array.
 * perspectivePos: the player whose actions form the line code (IP or OOP position label).
 * Concatenates ALL actions of the perspective player on each street, matching snap's format.
 */
export function deriveQueryLine(lineActions, perspectivePos) {
  const byStreet = { flop: [], turn: [], river: [] };

  for (const action of lineActions) {
    if (action.actor === perspectivePos) {
      byStreet[action.street].push(action.action);
    }
  }

  const parts = [];
  for (const street of STREETS) {
    const acts = byStreet[street];
    if (acts.length === 0) break;
    parts.push(acts.map(a => ACTION_TO_LETTER[a] ?? 'X').join(''));
  }

  return parts.join('-');
}

/**
 * Build the matchup key used in filenames.
 * perspective: 'ip' or 'oop' — whose snap export this represents.
 */
export function matchupToKey(oopPos, ipPos, potType, playerType, perspective = 'ip') {
  return `${oopPos}_vs_${ipPos}_${potType}_${playerType ?? 'reg'}_${perspective}`;
}
