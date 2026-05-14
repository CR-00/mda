export const POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

export const MATCHUPS = [
  { id: "btn_bb", label: "BTN vs BB", oop: "BB", ip: "BTN", desc: "Single raised pot" },
  { id: "co_bb", label: "CO vs BB", oop: "BB", ip: "CO", desc: "Single raised pot" },
  { id: "co_btn", label: "CO vs BTN", oop: "CO", ip: "BTN", desc: "3-bet pot available" },
  { id: "sb_bb", label: "SB vs BB", oop: "SB", ip: "BB", desc: "Limped/raised" },
  { id: "btn_sb", label: "BTN vs SB", oop: "SB", ip: "BTN", desc: "Single raised pot" },
  { id: "utg_bb", label: "UTG vs BB", oop: "BB", ip: "UTG", desc: "Single raised pot" },
];

export const FILTERS = {
  texture: [
    { id: "high",     label: "High card (A/K/Q hi)", auto: (b) => b && b[0] && "AKQ".includes(b[0].rank) },
    { id: "mid",      label: "Middling (J/T/9 hi)",  auto: (b) => b && b[0] && "JT9".includes(b[0].rank) },
    { id: "low",      label: "Low (8 hi or lower)",  auto: (b) => b && b[0] && "87654".includes(b[0].rank) },
    { id: "paired",   label: "Paired flop",          auto: (b) => b && b[0] && b[1] && b[0].rank === b[1].rank },
    { id: "monotone", label: "Monotone",             auto: (b) => b && b[0] && b[1] && b[2] && b[0].suit === b[1].suit && b[1].suit === b[2].suit },
    { id: "twotone",  label: "Two-tone",             auto: (b) => { if (!b || !b[0] || !b[1] || !b[2]) return false; const s = new Set([b[0].suit, b[1].suit, b[2].suit]); return s.size === 2; } },
    { id: "rainbow",  label: "Rainbow",              auto: (b) => b && b[0] && b[1] && b[2] && new Set([b[0].suit, b[1].suit, b[2].suit]).size === 3 },
  ],
};

export function fmtCount(n) {
  if (n >= 1000) return (n/1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return Math.round(n).toString();
}
