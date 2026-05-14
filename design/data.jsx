// Mock population data for poker pop-stat lookup
const POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

const MATCHUPS = [
  { id: "btn_bb", label: "BTN vs BB", oop: "BB", ip: "BTN", desc: "Single raised pot" },
  { id: "co_bb", label: "CO vs BB", oop: "BB", ip: "CO", desc: "Single raised pot" },
  { id: "co_btn", label: "CO vs BTN", oop: "CO", ip: "BTN", desc: "3-bet pot available" },
  { id: "sb_bb", label: "SB vs BB", oop: "SB", ip: "BB", desc: "Limped/raised" },
  { id: "btn_sb", label: "BTN vs SB", oop: "SB", ip: "BTN", desc: "Single raised pot" },
  { id: "utg_bb", label: "UTG vs BB", oop: "BB", ip: "UTG", desc: "Single raised pot" },
];

const FILTERS = {
  texture: [
    { id: "high",     label: "High card (A/K/Q hi)", auto: (b) => b && b[0] && "AKQ".includes(b[0].rank) },
    { id: "mid",      label: "Middling (J/T/9 hi)",  auto: (b) => b && b[0] && "JT9".includes(b[0].rank) },
    { id: "low",      label: "Low (8 hi or lower)",  auto: (b) => b && b[0] && "87654".includes(b[0].rank) },
    { id: "paired",   label: "Paired flop",          auto: (b) => b && b.length >= 2 && b[0].rank === b[1].rank },
    { id: "monotone", label: "Monotone",             auto: (b) => b && b.length === 3 && b.every(c => c.suit === b[0].suit) },
    { id: "twotone",  label: "Two-tone",             auto: (b) => { if (!b || b.length < 3) return false; const s = new Set(b.slice(0,3).map(c=>c.suit)); return s.size === 2; } },
    { id: "rainbow",  label: "Rainbow",              auto: (b) => b && b.length >= 3 && new Set(b.slice(0,3).map(c=>c.suit)).size === 3 },
  ],
};

// Stable PRNG
function mkRng(seedStr) {
  let h = 0; for (let i=0;i<seedStr.length;i++) h = (h*31 + seedStr.charCodeAt(i)) | 0;
  return () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return (h % 10000) / 10000; };
}

const SIZE_BUCKETS = [
  { id: "300",  label: "300%", val: 3.00 },
  { id: "200",  label: "200%", val: 2.00 },
  { id: "150",  label: "150%", val: 1.50 },
  { id: "125",  label: "125%", val: 1.25 },
  { id: "100",  label: "100%", val: 1.00 },
  { id: "75",   label: "75%",  val: 0.75 },
  { id: "66",   label: "66%",  val: 0.66 },
  { id: "50",   label: "50%",  val: 0.50 },
  { id: "33",   label: "33%",  val: 0.33 },
  { id: "25",   label: "25%",  val: 0.25 },
];

// Pre-computed bluff% baselines: bigger sizes are more bluffy in pop pools
const BLUFF_BASE = {
  "300": 0.59, "200": 0.56, "150": 0.45, "125": 0.38,
  "100": 0.32, "75": 0.27, "66": 0.24, "50": 0.21, "33": 0.12, "25": 0.14, "10": 0.20,
};

function fmtCount(n) {
  if (n >= 1000) return (n/1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return Math.round(n).toString();
}

// Hero bets — table 1 ("Bet Size" / Bluff EV)
function getBetSizeTable(line, hero, matchup, board) {
  const street = line.length ? line[line.length-1].street : "flop";
  const seed = "bs|" + line.map(a=>a.action+a.sizing).join(",") + "|" + matchup + "|" + street;
  const rng = mkRng(seed);

  const totalSample = Math.floor(8000 + rng()*40000);
  const sampleEachOverall = Math.floor(totalSample * (0.55 + rng()*0.10));

  // Baseline overall stats
  const overallFreq = Math.round(40 + rng()*30);  // 40–70 (pct?)
  const overallAvgSize = 60 + rng()*60;           // %
  const overallPot = 40 + rng()*30;               // bb
  const overallBluffEV = 18 + rng()*10;           // %

  const rows = SIZE_BUCKETS.map(s => {
    const r = mkRng(seed + s.id);
    const freq = Math.round(30 + r()*60);
    const sample = Math.max(60, Math.floor(totalSample * (0.04 + r()*0.18)));
    const ofN = Math.floor(sample / (0.55 + r()*0.30));
    const avgSize = s.val * 100 * (0.95 + r()*0.10);
    const potSize = (street === "river" ? 50 : street === "turn" ? 35 : 22) + s.val*15 + r()*8;
    const bluffEV = 14 + (s.val > 1.5 ? 18 : 4) + r()*8;
    return {
      label: s.label,
      freq, sample, ofN,
      avgSize, potSize, bluffEV,
    };
  });

  return {
    overall: {
      label: "Overall",
      freq: overallFreq,
      sample: sampleEachOverall, ofN: totalSample,
      avgSize: overallAvgSize, potSize: overallPot,
      bluffEV: overallBluffEV,
    },
    rows,
  };
}

// Facing villain's bet — table 2 ("Size" with bluff%, next action, Call EV)
function getFacingSizeTable(line, hero, matchup, board) {
  const street = line.length ? line[line.length-1].street : "flop";
  const seed = "fs|" + line.map(a=>a.action+a.sizing).join(",") + "|" + matchup + "|" + street;
  const rng = mkRng(seed);

  const totalSample = Math.floor(20000 + rng()*20000);
  const overallFreq = Math.round(38 + rng()*15);
  const overallAvgSize = 60 + rng()*40;
  const overallPot = 22 + rng()*12;
  const overallCallEV = -2 + rng()*4;
  const overallBluff = 0.27 + rng()*0.04;

  const buckets = [...SIZE_BUCKETS, { id: "10", label: "10%", val: 0.10 }];

  const rows = buckets.map(s => {
    const r = mkRng(seed + s.id);
    const freq = Math.max(0, Math.round(2 + r()*16 - (s.val>1.5 ? 12 : 0)));
    const sample = Math.max(50, Math.floor(totalSample * (0.02 + r()*0.20)));
    const bluffPct = (BLUFF_BASE[s.id] ?? 0.25) + (r()*0.04 - 0.02);
    // Next action: BF (bluffraise), BC (bluffcatch/call), BR (raise)
    const bf = 0.35 + r()*0.25 - (s.val>1.5 ? 0 : 0.05);
    const bc = 0.30 + r()*0.20;
    const br = Math.max(0, 1 - bf - bc) * (0.4 + r()*0.4);
    const sumNA = bf + bc + br;
    const avgSize = s.val * 100 * (0.96 + r()*0.08);
    const potSize = 25 + s.val*4 + r()*4;
    const callEV = (s.val > 1.5 ? 30 + r()*70 : (s.val > 0.7 ? -10 + r()*20 : -3 + r()*10));
    return {
      label: s.label,
      freq, sample, ofN: totalSample,
      bluffPct,
      next: { bf: bf/sumNA, bc: bc/sumNA, br: br/sumNA, hasBR: s.val < 1.5 || r() > 0.6 },
      avgSize, potSize, callEV,
      sizeRatio: s.val,
    };
  });

  return {
    overall: {
      label: "Overall",
      freq: overallFreq,
      sample: Math.floor(totalSample*0.5), ofN: totalSample,
      bluffPct: overallBluff,
      next: { bf: 0.58, bc: 0.376, br: 0.092, hasBR: true },
      avgSize: overallAvgSize, potSize: overallPot, callEV: overallCallEV,
    },
    rows,
  };
}

// Facing villain's bet, by texture — table 3
function getFacingTextureTable(line, hero, matchup, board) {
  const street = line.length ? line[line.length-1].street : "flop";
  const seed = "ft|" + line.map(a=>a.action+a.sizing).join(",") + "|" + matchup + "|" + street;
  const rng = mkRng(seed);

  const totalSample = Math.floor(20000 + rng()*20000);
  const overallFreq = Math.round(40 + rng()*15);
  const overallAvgSize = 88 + rng()*8;
  const overallPot = 27 + rng()*4;
  const overallCallEV = -1 + rng()*2;

  const TEXTURES = [
    "River Nuts Changed", "River Unpaired", "River Flush Hits (flop two-tone)",
    "Turn Nuts Changed", "Turn Straight Hits",
    "Flop Ace-bdw-low", "Flop Double Broadway", "Flop Disconnected",
    "Flop Paired", "Flop Monotone",
  ];

  const rows = TEXTURES.map(label => {
    const r = mkRng(seed + label);
    const freq = Math.round(43 + r()*12);
    const sample = Math.max(800, Math.floor(totalSample * (0.10 + r()*0.50)));
    const ofN = Math.max(sample+100, Math.floor(totalSample * (0.40 + r()*0.50)));
    const bluffPct = 0.27 + r()*0.07;
    const bf = 0.55 + r()*0.10;
    const bc = 0.30 + r()*0.15;
    const br = Math.max(0, 1 - bf - bc) * 0.5;
    const sumNA = bf + bc + br;
    const avgSize = 88 + r()*8;
    const potSize = 28 + r()*4;
    const callEV = -3 + r()*15;
    return {
      label,
      freq, sample, ofN,
      bluffPct,
      next: { bf: bf/sumNA, bc: bc/sumNA, br: br/sumNA, hasBR: true },
      avgSize, potSize, callEV,
    };
  });

  return {
    overall: {
      label: "Overall",
      freq: overallFreq,
      sample: Math.floor(totalSample*0.5), ofN: totalSample,
      bluffPct: 0.277,
      next: { bf: 0.58, bc: 0.376, br: 0.092, hasBR: true },
      avgSize: overallAvgSize, potSize: overallPot, callEV: overallCallEV,
    },
    rows,
  };
}

window.PokerData = {
  POSITIONS, MATCHUPS, FILTERS,
  getBetSizeTable, getFacingSizeTable, getFacingTextureTable,
  fmtCount,
};
