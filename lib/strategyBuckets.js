// The strategy buckets that have a built library in blob storage.
// `roles` documents who sits IP/OOP so the UI can label perspectives correctly
// (the preflop aggressor is not always IP — e.g. blind-vs-blind and 3-bet pots).
export const STRATEGY_BUCKETS = [
  { id: 'BB_vs_LP_srp_reg',     label: 'BB vs LP · SRP · reg',     ip: 'LP opener',   oop: 'BB caller' },
  { id: 'SB_vs_BB_srp_reg',     label: 'SB vs BB · SRP · reg',     ip: 'BB caller',   oop: 'SB opener' },
  { id: 'BB_vs_EP_srp_reg',     label: 'BB vs EP · SRP · reg',     ip: 'EP opener',   oop: 'BB caller' },
  { id: 'Blinds_vs_LP_3bp_reg', label: 'Blinds vs LP · 3-bet pot', ip: 'LP caller',   oop: 'Blinds 3-bettor' },
  { id: 'BB_vs_LP_srp_fish',    label: 'BB vs LP · SRP · FISH',    ip: 'LP opener',   oop: 'BB caller' },
];

export const DEFAULT_BUCKET = 'BB_vs_LP_srp_reg';

export function bucketMeta(id) {
  return STRATEGY_BUCKETS.find(b => b.id === id) || STRATEGY_BUCKETS[0];
}
