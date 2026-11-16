// The spots the app offers, in two modes:
//   simple   — positions grouped (LP = BTN/CO, EP = HJ/LJ, Blinds = SB/BB in 3BPs)
//   advanced — one spot per snap matchup (BTN vs BB, CO vs BB, …). snap's own
//              finest split; it doesn't break "HJ/LJ vs IP" down further.
//
// ip/oop are the actor labels used in the action tree; keyBase is the
// "<oop>_vs_<ip>_<pot>" prefix of the stored data files. Spots that are the
// same in both modes (BvB, HJ/LJ vs IP) share a keyBase, so they share data.

export const SIMPLE_SPOTS = [
  { id: 'lp_bb_srp',     label: 'LP vs BB',     ip: 'LP',  oop: 'BB',     pot: 'srp', keyBase: 'BB_vs_LP_srp' },
  { id: 'ep_bb_srp',     label: 'EP vs BB',     ip: 'EP',  oop: 'BB',     pot: 'srp', keyBase: 'BB_vs_EP_srp' },
  { id: 'lp_blinds_3bp', label: 'LP vs Blinds', ip: 'LP',  oop: 'Blinds', pot: '3bp', keyBase: 'Blinds_vs_LP_3bp' },
  { id: 'ep_blinds_3bp', label: 'EP vs Blinds', ip: 'EP',  oop: 'Blinds', pot: '3bp', keyBase: 'Blinds_vs_EP_3bp' },
  // LP vs LP seats CO (OOP) and BTN (IP) so the two players stay distinct in the tree.
  { id: 'lp_lp_3bp',     label: 'LP vs LP',     ip: 'BTN', oop: 'CO',     pot: '3bp', keyBase: 'LP_vs_LP_3bp' },
  { id: 'ep_lp_3bp',     label: 'EP vs LP',     ip: 'LP',  oop: 'EP',     pot: '3bp', keyBase: 'EP_vs_LP_3bp' },
  { id: 'bvb_srp',       label: 'BvB',          ip: 'BB',  oop: 'SB',     pot: 'srp', keyBase: 'SB_vs_BB_srp' },
  { id: 'bvb_3bp',       label: 'BvB',          ip: 'BB',  oop: 'SB',     pot: '3bp', keyBase: 'SB_vs_BB_3bp' },
  // 4BPs mirror the 3BP groups: the opener 4-bets whoever 3-bet them.
  { id: 'lp_blinds_4bp', label: 'LP vs Blinds', ip: 'LP',  oop: 'Blinds', pot: '4bp', keyBase: 'Blinds_vs_LP_4bp' },
  { id: 'ep_blinds_4bp', label: 'EP vs Blinds', ip: 'EP',  oop: 'Blinds', pot: '4bp', keyBase: 'Blinds_vs_EP_4bp' },
  { id: 'lp_lp_4bp',     label: 'LP vs LP',     ip: 'BTN', oop: 'CO',     pot: '4bp', keyBase: 'LP_vs_LP_4bp' },
  { id: 'ep_lp_4bp',     label: 'EP vs LP',     ip: 'LP',  oop: 'EP',     pot: '4bp', keyBase: 'EP_vs_LP_4bp' },
  { id: 'bvb_4bp',       label: 'BvB',          ip: 'BB',  oop: 'SB',     pot: '4bp', keyBase: 'SB_vs_BB_4bp' },
];

const adv = (ip, oop, pot, label) => ({
  id: `adv_${ip}_${oop}_${pot}`.toLowerCase(),
  label: label ?? `${ip} vs ${oop}`,
  ip, oop, pot,
  keyBase: `${oop}_vs_${ip}_${pot}`,
});

export const ADVANCED_SPOTS = [
  adv('BTN', 'BB', 'srp'),
  adv('CO',  'BB', 'srp'),
  adv('HJ',  'BB', 'srp'),
  adv('LJ',  'BB', 'srp'),
  adv('BB',  'SB', 'srp', 'BvB'),
  adv('BTN', 'BB', '3bp'),
  adv('BTN', 'SB', '3bp'),
  adv('CO',  'BB', '3bp'),
  adv('CO',  'SB', '3bp'),
  adv('HJ',  'BB', '3bp'),
  adv('HJ',  'SB', '3bp'),
  adv('LJ',  'BB', '3bp'),
  adv('LJ',  'SB', '3bp'),
  // BTN 3-bets CO: both seats are real positions here.
  adv('BTN', 'CO', '3bp', 'CO vs BTN'),
  { id: 'adv_hjlj_ip_3bp', label: 'HJ/LJ vs IP', ip: 'LP', oop: 'EP', pot: '3bp', keyBase: 'EP_vs_LP_3bp' },
  adv('BB',  'SB', '3bp', 'BvB'),
  // 4BPs: the same matchups as 3BPs, with the opener 4-betting.
  adv('BTN', 'BB', '4bp'),
  adv('BTN', 'SB', '4bp'),
  adv('CO',  'BB', '4bp'),
  adv('CO',  'SB', '4bp'),
  adv('HJ',  'BB', '4bp'),
  adv('HJ',  'SB', '4bp'),
  adv('LJ',  'BB', '4bp'),
  adv('LJ',  'SB', '4bp'),
  adv('BTN', 'CO', '4bp', 'CO vs BTN'),
  { id: 'adv_hjlj_ip_4bp', label: 'HJ/LJ vs IP', ip: 'LP', oop: 'EP', pot: '4bp', keyBase: 'EP_vs_LP_4bp' },
  adv('BB',  'SB', '4bp', 'BvB'),
];

export const MODES = ['simple', 'advanced'];
export const spotsForMode = (mode) => (mode === 'advanced' ? ADVANCED_SPOTS : SIMPLE_SPOTS);

export function findSpot(mode, ip, oop, pot) {
  return spotsForMode(mode).find(s => s.ip === ip && s.oop === oop && s.pot === pot) ?? null;
}

// Data key for a spot, e.g. "BB_vs_BTN_srp_reg_ip".
export const spotDataKey = (spot, playerType, perspective) =>
  `${spot.keyBase}_${playerType ?? 'reg'}_${perspective}`;

const BLINDS = new Set(['SB', 'BB', 'Blinds']);

// Is the OOP player the preflop raiser? SB opens BvB SRPs; in 3BPs a blind
// (or the Blinds group) 3-bets a later opener, and BvB 3BP is BB 3-betting SB.
// In 4BPs the opener 4-bets back, so the raiser flips relative to the 3BP:
// IP vs a blind 3-bettor, OOP when the 3-bettor was IP (CO vs BTN, BvB).
export function isOopPfr(ip, oop, pot) {
  if (pot === 'srp') return oop === 'SB' && ip === 'BB';
  const blindThreeBet = BLINDS.has(oop) && ip !== 'BB';
  return pot === '4bp' ? !blindThreeBet : blindThreeBet;
}

// Same, from a data-key base like "Blinds_vs_LP_3bp".
export function isOopPfrBase(keyBase) {
  const m = /^([A-Za-z]+)_vs_([A-Za-z]+)_([a-z0-9]+)$/.exec(keyBase ?? '');
  return !!m && isOopPfr(m[2], m[1], m[3]);
}
