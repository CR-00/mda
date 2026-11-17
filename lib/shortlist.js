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
//
// Only lines ending in a bet, raise or fold are kept. The screens read bet/raise
// lines (the bet being made or faced) and fold lines (bluff EV and the
// fold/call/raise split); river lines ending in a check or call add nothing.

const SHORTLIST = {
  ipPfr: [
    'B-B-B', 'B-B-F', 'B-B-R',
    'B-X-B', 'B-X-F', 'B-X-R',
    'X-B-B', 'X-B-F',
    'X-C-F', 'X-C-R',
    'X-X-B', 'X-X-F', 'X-X-R',
  ],
  oopPfc: [
    'X-B-B',
    'X-X-B', 'X-X-XF', 'X-X-XR',
    'X-XC-B', 'X-XC-XF', 'X-XC-XR',
    'XC-X-B', 'XC-X-XF', 'XC-X-XR',
    'XC-XC-B', 'XC-XC-XF', 'XC-XC-XR',
  ],
  ipPfc: [
    'B-B-F', 'B-B-R',
    'B-X-B', 'B-X-F', 'B-X-R',
    'C-B-B',
    'C-C-B', 'C-C-F', 'C-C-R',
    'C-X-B', 'C-X-F', 'C-X-R',
    'X-B-B', 'X-B-F',
    'X-C-B', 'X-C-F', 'X-C-R',
    'X-X-B', 'X-X-F', 'X-X-R',
  ],
  oopPfr: [
    'B-B-B', 'B-B-XF',
    'B-X-B', 'B-X-XF', 'B-X-XR',
    'B-XC-B', 'B-XC-XF',
    'X-B-B', 'X-B-XF', 'X-B-XR',
    'X-X-B', 'X-X-XF', 'X-X-XR',
    'X-XC-B', 'X-XC-XF', 'X-XC-XR',
    'XC-X-B', 'XC-X-XF', 'XC-X-XR',
    'XC-XC-B',
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
