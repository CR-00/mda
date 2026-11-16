import { SIMPLE_SPOTS, ADVANCED_SPOTS } from './spots';

// Turns a (normalized) snap export body into the storage key used in blob
// filenames, e.g. "BB_vs_LP_srp_reg_ip" (simple) or "BB_vs_BTN_srp_reg_ip"
// (advanced). Shared by the upload API and the upload modal so both agree on
// which configuration a paste belongs to. Returns null when the paste can't be
// stored in the requested mode.
//
// mode: 'simple' groups positions; 'advanced' keeps the exact seats and needs
// an export of a single snap matchup.
export function uploadDataKey(body, mode = 'simple') {
  const matchups = body?.query?.matchups ?? [];
  const matchup = matchups[0];
  if (!matchup) return null;

  const potType = body?._potType ?? (body?.query?.['Pot Type']?.[0] ?? '').toLowerCase().replace(/\s+/g, '');
  const playerType = (body?.query?.['Player Type']?.[0] ?? 'reg').toLowerCase().replace(/\s+/g, '');
  const perspective = (body?.query?.['IP/OOP']?.[0] ?? 'IP').toLowerCase() === 'oop' ? 'oop' : 'ip';
  const suffix = (potType ? '_' + potType : '') + '_' + playerType + '_' + perspective;

  let [rawOop, , rawIp] = matchup.split(' ');
  if (rawIp === 'BU') rawIp = 'BTN';
  if (rawOop === 'BU') rawOop = 'BTN';
  // snap lists blind-vs-blind as "BB vs SB", but postflop SB is OOP and BB is IP.
  if (rawOop === 'BB' && rawIp === 'SB') {
    rawOop = 'SB';
    rawIp = 'BB';
  }
  // snap's "HJ/LJ vs IP" group is HJ/LJ OOP vs a later (BTN/CO) IP seat. snap
  // doesn't split it further, so both modes store it as EP_vs_LP.
  const hjljGroup = rawOop === 'HJ/LJ' && rawIp === 'IP';

  if (mode === 'advanced') {
    // An export combining several matchups can only be stored grouped.
    if (matchups.length !== 1) return null;
    return (hjljGroup ? 'EP_vs_LP' : `${rawOop}_vs_${rawIp}`) + suffix;
  }

  if (hjljGroup) {
    rawOop = 'HJ';
    rawIp = 'BTN';
  }
  const LP = new Set(['BTN', 'CO']);
  const EP = new Set(['HJ', 'MP', 'LJ', 'UTG']);
  const group = (pos) => LP.has(pos) ? 'LP' : EP.has(pos) ? 'EP' : pos;
  const ipGroup = group(rawIp);
  // In 3bp/4bp vs LP/EP, OOP is always a blind 3-bettor — collapse BB/SB into one
  // bucket. BvB (ipGroup === 'BB') keeps SB as the OOP position. Non-blind OOP (e.g.
  // CO vs BTN) groups like IP does, giving LP_vs_LP / EP_vs_LP.
  const reraised = potType === '3bp' || potType === '4bp';
  const oopGroup = (reraised && (ipGroup === 'LP' || ipGroup === 'EP') && (rawOop === 'BB' || rawOop === 'SB'))
    ? 'Blinds'
    : group(rawOop);
  return `${oopGroup}_vs_${ipGroup}` + suffix;
}

// Data-key bases (oop_vs_ip_pot) the app has a spot for, in either mode.
const KNOWN_BASES = new Set([...SIMPLE_SPOTS, ...ADVANCED_SPOTS].map(s => s.keyBase));

// True when a data key belongs to a spot the app shows.
export function isKnownSpotKey(dataKey) {
  const m = /^([A-Za-z]+_vs_[A-Za-z]+_[a-z0-9]+)_[a-z]+_(ip|oop)$/.exec(dataKey ?? '');
  return !!m && KNOWN_BASES.has(m[1]);
}
