import { isOopPfrBase } from './spots';

// The river lines the app tracks and accepts for upload, per preflop role.
//
// Chosen from stored hand counts (Nov 2026): for each role, the most-reached
// river decision points until every configuration in that role covers >= 80%
// of river hands, plus the spots on the other player's side that those screens
// load (e.g. IP's bet screen reads OOP's matching fold file). Every
// configuration ends up covering 81-92% of river hands.
// See river-node-frequency.md at the repo root for the ranking behind it.
// The lists come from SRP/3BP data; 4BP spots use the same list for their role
// until there is 4BP data to rank.

const SHORTLIST = {
  ipPfr: [
    'B-B-B', 'B-B-C', 'B-B-F', 'B-B-R', 'B-B-X',
    'B-X-B', 'B-X-C', 'B-X-F', 'B-X-R', 'B-X-X',
    'X-B-B', 'X-B-C', 'X-B-F', 'X-B-X',
    'X-C-C', 'X-C-F', 'X-C-R',
    'X-X-B', 'X-X-C', 'X-X-F', 'X-X-R', 'X-X-X',
  ],
  oopPfc: [
    'X-B-B', 'X-B-X',
    'X-X-B', 'X-X-X', 'X-X-XC', 'X-X-XF', 'X-X-XR',
    'X-XC-B', 'X-XC-X', 'X-XC-XC', 'X-XC-XF', 'X-XC-XR',
    'XC-X-B', 'XC-X-X', 'XC-X-XC', 'XC-X-XF', 'XC-X-XR',
    'XC-XC-B', 'XC-XC-X', 'XC-XC-XC', 'XC-XC-XF', 'XC-XC-XR',
  ],
  ipPfc: [
    'B-B-C', 'B-B-F', 'B-B-R',
    'B-X-B', 'B-X-C', 'B-X-F', 'B-X-R', 'B-X-X',
    'C-B-B', 'C-B-X',
    'C-C-B', 'C-C-C', 'C-C-F', 'C-C-R', 'C-C-X',
    'C-X-B', 'C-X-C', 'C-X-F', 'C-X-R', 'C-X-X',
    'X-B-B', 'X-B-C', 'X-B-F', 'X-B-X',
    'X-C-B', 'X-C-C', 'X-C-F', 'X-C-R', 'X-C-X',
    'X-X-B', 'X-X-C', 'X-X-F', 'X-X-R', 'X-X-X',
  ],
  oopPfr: [
    'B-B-B', 'B-B-X', 'B-B-XC', 'B-B-XF',
    'B-X-B', 'B-X-X', 'B-X-XC', 'B-X-XF', 'B-X-XR',
    'B-XC-B', 'B-XC-X', 'B-XC-XC', 'B-XC-XF',
    'X-B-B', 'X-B-X', 'X-B-XC', 'X-B-XF', 'X-B-XR',
    'X-X-B', 'X-X-X', 'X-X-XC', 'X-X-XF', 'X-X-XR',
    'X-XC-B', 'X-XC-X', 'X-XC-XC', 'X-XC-XF', 'X-XC-XR',
    'XC-X-B', 'XC-X-X', 'XC-X-XC', 'XC-X-XF', 'XC-X-XR',
    'XC-XC-B', 'XC-XC-X',
  ],
};

const SETS = Object.fromEntries(Object.entries(SHORTLIST).map(([k, v]) => [k, new Set(v)]));

// Role key for a data key like "BB_vs_LP_srp_reg_ip" or "BB_vs_BTN_3bp_reg_oop", or null if unrecognised.
export function roleForDataKey(dataKey) {
  const m = /^([A-Za-z]+_vs_[A-Za-z]+_[a-z0-9]+)_[a-z]+_(ip|oop)$/.exec(dataKey ?? '');
  if (!m) return null;
  const [, base, perspective] = m;
  const oopIsPfr = isOopPfrBase(base);
  if (perspective === 'ip') return oopIsPfr ? 'ipPfc' : 'ipPfr';
  return oopIsPfr ? 'oopPfr' : 'oopPfc';
}

// Shortlisted river lines for a data key ([] if the key is unrecognised).
export function shortlistFor(dataKey) {
  const role = roleForDataKey(dataKey);
  return role ? SHORTLIST[role] : [];
}

export function isShortlisted(dataKey, line) {
  const role = roleForDataKey(dataKey);
  return !!role && SETS[role].has(line);
}
