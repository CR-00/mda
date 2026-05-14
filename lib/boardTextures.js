// Reverse-engineered from snap.js — client-side board texture engine.
// Input: array of { rank, suit } objects (rank: 2-9,T,J,Q,K,A  suit: c,d,h,s)
// Output: array of texture label strings matching snap.js's `wy` list.

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

// card integer encoding: rank*4 + suit  (matches snap.js DECK layout)
function encode({ rank, suit }) {
  return RANKS.indexOf(rank) * 4 + SUITS.indexOf(suit);
}

function getRank(card) { return card >> 2; }
function getSuit(card) { return card & 3; }

function uniqueRanks(cards) {
  return [...new Set(cards.map(getRank))];
}

function highCard(cards) {
  return Math.max(...cards.map(getRank));
}

function suitCount(cards) {
  return new Set(cards.map(getSuit)).size;
}

function suitCounts(cards) {
  return cards.reduce((acc, c) => { acc[getSuit(c)]++; return acc; }, [0, 0, 0, 0]);
}

function mostSuit(cards) {
  return Math.max(...suitCounts(cards));
}

// True if cards contain a complete 5-card straight (including wheel A-2-3-4-5)
function containsStraight(cards) {
  const ranks = uniqueRanks(cards).sort((a, b) => a - b);
  const ACE = 12;
  // wheel: A plays as 0
  if (ranks.includes(ACE) && ranks.includes(0) && ranks.includes(1) && ranks.includes(2) && ranks.includes(3))
    return true;
  for (let i = 0; i <= ranks.length - 5; i++) {
    let ok = true;
    for (let j = i; j < i + 4; j++) {
      if (ranks[j] + 1 !== ranks[j + 1]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Number of rank values (×4 suits each) that complete a straight
function calcStraightOuts(cards) {
  if (containsStraight(cards)) return 0;
  let outs = 0;
  for (let r = 0; r < 13; r++) {
    const candidate = [...cards, r * 4]; // suit doesn't matter for rank check
    if (containsStraight(candidate)) outs += 4;
  }
  return outs;
}

// True if a straight is "possible" — i.e. any 3 ranks span ≤4, or wheel draw exists
function straightPossible(cards) {
  const ranks = uniqueRanks(cards).sort((a, b) => a - b);
  if (ranks.length < 3) return false;
  const ACE = 12, FIVE = 3;
  // wheel draw: A + two low cards (≤5)
  if (ranks.includes(ACE) && ranks.filter(r => r <= FIVE).length >= 2) return true;
  for (let i = 0; i < ranks.length - 2; i++) {
    if (ranks[i + 2] - ranks[i] <= 4) return true;
  }
  return false;
}

// Precomputed "not oesdPossible" 3-card rank combos (from snap.js array v)
const NOT_OESD_3 = new Set(["0","1","0,1,2","2","0,1,3","0,2,3","1,2,3","3","0,4","0,1,4","0,2,4","1,2,4","0,3,4","1,3,4","2,3,4","4","0,5","1,5","1,2,5","1,3,5","2,3,5","1,4,5","2,4,5","3,4,5","5","0,6","1,6","2,6","2,3,6","2,4,6","3,4,6","2,5,6","3,5,6","4,5,6","6","0,7","1,7","2,7","3,7","3,4,7","3,5,7","4,5,7","3,6,7","4,6,7","5,6,7","7","0,8","1,8","2,8","3,8","0,4,8","4,8","4,5,8","4,6,8","5,6,8","4,7,8","5,7,8","6,7,8","8","0,9","1,9","2,9","3,9","0,4,9","4,9","0,5,9","1,5,9","5,9","5,6,9","5,7,9","6,7,9","5,8,9","6,8,9","7,8,9","9","0,10","1,10","2,10","3,10","0,4,10","4,10","0,5,10","1,5,10","5,10","0,6,10","1,6,10","2,6,10","6,10","6,7,10","6,8,10","7,8,10","6,9,10","7,9,10","8,9,10","10","0,11","1,11","2,11","3,11","0,4,11","4,11","0,5,11","1,5,11","5,11","0,6,11","1,6,11","2,6,11","6,11","0,7,11","1,7,11","2,7,11","3,7,11","7,11","7,8,11","7,9,11","8,9,11","7,10,11","8,10,11","9,10,11","11","0,12","0,1,12","1,12","0,2,12","1,2,12","2,12","0,3,12","1,3,12","2,3,12","3,12","0,4,12","4,12","0,5,12","5,12","0,6,12","1,6,12","2,6,12","6,12","0,7,12","1,7,12","2,7,12","3,7,12","7,12","0,8,12","1,8,12","2,8,12","3,8,12","4,8,12","8,12","0,9,12","1,9,12","2,9,12","3,9,12","4,9,12","5,9,12","8,9,12","9,12","0,10,12","1,10,12","2,10,12","3,10,12","4,10,12","5,10,12","8,10,12","9,10,12","10,12","0,11,12","1,11,12","2,11,12","3,11,12","4,11,12","5,11,12","6,11,12","7,11,12","8,11,12","9,11,12","10,11,12","11,12","12"]);

function oesdPossible(cards) {
  if (cards.length === 3) {
    const key = uniqueRanks(cards).sort((a, b) => a - b).join(",");
    return !NOT_OESD_3.has(key);
  }
  if (straightPossible(cards) || uniqueRanks(cards).length < 2) return false;
  for (let r1 = 0; r1 < 13; r1++) {
    for (let r2 = r1; r2 < 13; r2++) {
      const extra = [r1 * 4, r2 * 4 + (r1 === r2 ? 1 : 0)];
      if (calcStraightOuts([...cards, ...extra]) === 8) return true;
    }
  }
  return false;
}

// Generates all size-k combinations from array
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ];
}

// True if the last card creates a new straight that didn't exist in any 3-card subset of the prior cards
function nutsNewStraightOnCard(board) {
  const prev = board.slice(0, -1);
  const last = board[board.length - 1];
  for (const trio of combinations(prev, 3)) {
    if (!containsStraight(trio) && containsStraight([...trio, last])) return true;
  }
  return false;
}

// "Nuts changed" heuristic (c3e in snap.js)
function nutsChanged({ board }) {
  if (board.length <= 3) return null;
  const prev = board.slice(0, -1);
  const last = board[board.length - 1];
  const lastRank = getRank(last);
  const prevRanks = prev.map(getRank);
  const paired = prevRanks.includes(lastRank);
  const prevHasPair = new Set(prevRanks).size < prev.length;
  const overcardNow = lastRank > Math.max(...prevRanks);
  const prevMonotone = mostSuit(prev) >= 3;
  const newFlushDraw = mostSuit(board) > mostSuit(prev) && mostSuit(board) >= 3;
  const prevStraight = straightPossible(prev);
  const nowStraight = straightPossible(board);

  if (paired) {
    if (!prevHasPair) return true;
    const pairedRank = prevRanks.find(r => prevRanks.indexOf(r) !== prevRanks.lastIndexOf(r)) ?? 0;
    return lastRank > pairedRank;
  }
  if (prevHasPair) return false;
  if (newFlushDraw) {
    if (!prevMonotone) return true;
    const lastSuit = getSuit(last);
    const sameSuitRanks = prev.filter(c => getSuit(c) === lastSuit).map(getRank);
    return Math.max(...sameSuitRanks) < lastRank;
  }
  if (prevMonotone) return false;
  if (nowStraight) {
    if (prevStraight) return highestStraightRank(board) > highestStraightRank(prev);
    return true;
  }
  if (prevStraight) return false;
  return overcardNow;
}

// Returns the rank of the top card in the best possible straight draw
function highestStraightRank(cards) {
  if (!straightPossible(cards)) return -1;
  const rankSet = new Set(cards.map(getRank));
  for (let top = 12; top >= 5; top--) {
    let gaps = 0;
    for (let i = 0; i < 5; i++) if (!rankSet.has(top - i)) gaps++;
    if (gaps <= 2) return top;
  }
  return 3; // wheel top
}

// ─── Flop ────────────────────────────────────────────────────────────────────

const ACE = 12, NINE = 7, TEN = 8;

function flopTextures(cards) {
  const out = [];
  const ranks = cards.map(getRank);
  const uRanks = uniqueRanks(cards);
  const high = highCard(cards);
  const sc = suitCount(cards);
  const broadwayCount = ranks.filter(r => r >= TEN).length;
  const aceCount = ranks.filter(r => r === ACE).length;
  const nonAceBroadway = broadwayCount - aceCount;
  const sp = straightPossible(cards);
  const twoToneAndStraight = sc === 2 && sp;

  if (uRanks.length === 1) return ["Flop Trips"];

  // High card + ace structure
  if (high === ACE) {
    out.push("Flop A high");
    if (aceCount === 1) {
      if (nonAceBroadway === 0) out.push("Flop Ace-low-low");
      else if (nonAceBroadway === 1) out.push("Flop Ace-bdw-low");
      else out.push("Flop Ace-bdw-bdw");
    }
  } else if (high === ACE - 1) out.push("Flop K high");
  else if (high === ACE - 2) out.push("Flop Q high");
  else if (high === ACE - 3) out.push("Flop J high");
  else if (high === ACE - 4) out.push("Flop T high");
  else if (high === NINE)   out.push("Flop 9 high");
  else                       out.push("Flop Low");

  // Suitedness
  if (sc === 1) out.push("Flop Monotone");
  else if (sc === 2) out.push("Flop Two-Tone");
  else out.push("Flop Rainbow");

  // Broadway count
  if (broadwayCount === 1) out.push("Flop Single Broadway");
  else if (broadwayCount === 2) out.push("Flop Double Broadway");
  else if (broadwayCount === 3) out.push("Flop Triple Broadway");

  // Pairing
  if (uRanks.length === 2) {
    const pairedRank = ranks.find(r => ranks.indexOf(r) !== ranks.lastIndexOf(r));
    const kicker = ranks.find(r => r !== pairedRank);
    if (pairedRank === ACE) out.push("Flop Ace Paired");
    else if (pairedRank >= TEN) out.push("Flop K-T Paired");
    else out.push(`Flop 9-2 Paired (${kicker >= TEN ? "T+" : "Low"} kicker)`);
  } else {
    out.push("Flop unpaired");
  }

  // Connectivity
  if (sp) out.push("Flop Straight Possible");
  else if (oesdPossible(cards)) out.push("Flop OESD Possible");
  else out.push("Flop Disconnected");

  // Wetness
  if (high >= NINE && twoToneAndStraight) out.push("Flop Wet (9+ high)");
  else if (twoToneAndStraight) out.push("Flop Wet (Low)");

  return out;
}

// ─── Turn ────────────────────────────────────────────────────────────────────

function turnTextures(cards) {
  const out = [];
  const flop = cards.slice(0, 3);
  const turnCard = cards[3];
  const turnRank = getRank(turnCard);
  const flopRanks = flop.map(getRank).sort((a, b) => b - a);
  const flopSC = suitCount(flop);
  const allSC = suitCount(cards);
  const allMost = mostSuit(cards);
  const straight4 = calcStraightOuts(cards) > 0;
  const flopPaired = new Set(flopRanks).size < flop.length;
  const paired = flopRanks.includes(turnRank);
  const trips = flopPaired && paired && flopRanks.filter(r => r === turnRank).length > 1;
  const overcard = turnRank > Math.max(...flopRanks);

  // Nuts changed
  nutsChanged({ board: cards }) ? out.push("Turn Nuts Changed") : out.push("Turn Nuts Unchanged");

  // Flush progression
  if (allSC === 1) out.push("Turn 4-flush");
  else if (allSC === 3 && flopSC === 3) out.push("Turn BDFD Comes");
  else if (allSC === 2 && flopSC === 2 && allMost === 3) out.push("Turn Flush Hits");
  else if (allSC === 2 && flopSC === 2) out.push("Turn Double Flush Draw");
  else if (allSC === 2) out.push("Turn Flush Stays");
  else if (allSC === 3) out.push("Turn Flush Bricks");
  else if (allSC === 4) out.push("Turn Rainbow");

  // 4-straight
  if (straight4) out.push("Turn 4-straight");

  // Pairing
  if (trips) {
    out.push("Turn Trips (flop paired)");
  } else if (paired) {
    out.push("Turn Pairs");
    const pos = flopRanks.indexOf(turnRank);
    if (pos === 0) out.push("Turn top card pairs");
    else if (pos === 1) out.push("Turn 2nd card pairs");
    else out.push("Turn 3rd card pairs");
  } else if (new Set(flopRanks).size === 3) {
    out.push("Turn unpaired");
  }

  // Straight hits
  if ((!straightPossible(flop) && straightPossible(cards)) || nutsNewStraightOnCard(cards))
    out.push("Turn Straight Hits");

  // Position
  if (overcard && turnRank === ACE) out.push("Turn Ace Overcard");
  else if (overcard) out.push("Turn Overcard (not Ace)");
  else if (turnRank < Math.min(...flopRanks)) out.push("Turn Undercard");

  if (turnRank >= TEN) out.push("Turn Broadway");

  return out;
}

// ─── River ───────────────────────────────────────────────────────────────────

function riverTextures(cards) {
  const out = [];
  const flop = cards.slice(0, 3);
  const turn4 = cards.slice(0, 4);
  const riverCard = cards[4];
  const riverRank = getRank(riverCard);
  const isAce = riverRank === ACE;

  const allMost = mostSuit(cards);
  const turnMost = mostSuit(turn4);
  const flopMost = mostSuit(flop);
  const allRanks = cards.map(getRank).sort((a, b) => b - a);
  const turnRanks = turn4.map(getRank).sort((a, b) => b - a);
  const uRanksAll = new Set(allRanks).size;
  const paired = turnRanks.includes(riverRank);
  const overcard = riverRank > Math.max(...turnRanks);
  const broadwayAll = cards.filter(c => getRank(c) >= TEN).length;
  const straight4out = calcStraightOuts(cards);
  const hasStraight = containsStraight(cards);
  const flopHadStraight = straightPossible(turn4);

  // Early exits
  if (allMost === 5 || uRanksAll <= 2) return [];
  if (uRanksAll <= 3) return ["River 2p+"];
  if (allMost === 4 && flopMost === 3) return ["River 4-flush (mono flop)"];
  if (allMost === 4 && turnMost === 3) return ["River 4-flush (two-tone flop)"];
  if (straight4out > 0 && !hasStraight && straight4out <= 4) return ["River 4-straight 1 gap"];
  if (straight4out > 0 && !hasStraight) return ["River 4-straight no gap"];

  // Nuts changed
  nutsChanged({ board: cards }) ? out.push("River Nuts Changed") : out.push("River Nuts Unchanged");

  // Flush — use allMost (max cards of one suit) not suit-count to detect flush presence
  const flopSC = suitCount(flop);
  if (allMost >= 3) {
    if (turnMost >= 3 && flopMost >= 3) out.push("River Flush Stays (flop monotone)");
    else if (turnMost >= 3) out.push("River Flush Stays (flop two-tone)");
    else if (flopSC === 3) out.push("River Flush Hits (flop rainbow)");
    else out.push("River Flush Hits (flop two-tone)");
  } else if (turnMost > 1) {
    if (flopSC === 3) out.push("River Flush Bricks (flop rainbow)");
    else out.push("River Flush Bricks (flop two-tone)");
  }

  if (broadwayAll >= 3) out.push("River Triple Broadway");

  // Pairing
  if (paired) {
    if (isAce) {
      out.push("River Ace Pairs");
    } else {
      out.push("River Pairs (not Ace)");
      const pos = turnRanks.indexOf(riverRank);
      if (pos === 0) out.push("River top card pairs (not Ace)");
      else if (pos === 1) out.push("River 2nd card pairs");
      else if (pos === 2) out.push("River 3rd card pairs");
      else out.push("River 4th card pairs");
    }
  }

  if (uRanksAll === 5) out.push("River unpaired");

  const newStraight = !flopHadStraight && straightPossible(cards);
  if (newStraight || nutsNewStraightOnCard(cards)) out.push("River Straight Hits");

  if (overcard && isAce) out.push("River Ace Overcard");
  else if (overcard) out.push("River Overcard (not Ace)");
  else if (riverRank < Math.min(...turnRanks)) out.push("River Undercard");

  // Blank: river added nothing meaningful
  const noFlushChange = allMost === turnMost;
  if (!overcard && noFlushChange && !paired && !straight4out && !newStraight)
    out.push("River blank");

  if (riverRank >= TEN) out.push("River Broadway");

  return out;
}

// ─── Dependency filter ───────────────────────────────────────────────────────

// Textures that are implied by another texture in the set get removed.
const IMPLIES = {
  "Flop Wet (Low)": ["Flop Low"],
  "Flop Ace-bdw-bdw": ["Flop A high"],
  "Flop Ace-bdw-low": ["Flop A high"],
  "Flop Ace-low-low": ["Flop A high"],
  "Turn 4-flush": ["Flop Monotone"],
  "Turn BDFD Comes": ["Flop Rainbow"],
  "Turn Flush Hits": ["Flop Two-Tone"],
  "Turn Double Flush Draw": ["Flop Two-Tone"],
  "Turn Flush Stays": ["Flop Monotone"],
  "Turn Flush Bricks": ["Flop Two-Tone"],
  "Turn Rainbow": ["Flop Rainbow"],
  "Turn Pairs": ["Flop unpaired"],
  "Turn unpaired": ["Flop unpaired"],
  "Turn Trips (flop paired)": ["Flop 9-2 Paired (Low kicker)", "Flop 9-2 Paired (T+ kicker)", "Flop Ace Paired", "Flop K-T Paired"],
  "Flop 9-2 Paired (Low kicker)": ["Flop Low"],
  "Flop Ace Paired": ["Flop A high", "Flop Ace-low-low", "Flop Ace-bdw-low", "Flop Ace-bdw-bdw"],
  "Flop K-T Paired": ["Flop K high", "Flop Q high", "Flop J high", "Flop T high"],
  "Flop 9-2 Paired (T+ kicker)": ["Flop K high", "Flop Q high", "Flop J high", "Flop T high"],
  "Turn top card pairs": ["Turn Pairs", "Flop unpaired"],
  "Turn 2nd card pairs": ["Turn Pairs", "Flop unpaired"],
  "Turn 3rd card pairs": ["Turn Pairs", "Flop unpaired"],
  "Turn 4-straight": ["Flop Straight Possible"],
  "River unpaired": ["Flop unpaired", "Turn unpaired"],
  "River Flush Hits (flop two-tone)": ["Flop Two-Tone", "Turn Flush Bricks"],
  "River Flush Bricks (flop two-tone)": ["Flop Two-Tone", "Turn Flush Bricks"],
  "River Flush Stays (flop two-tone)": ["Flop Two-Tone", "Turn Flush Hits"],
  "River Flush Stays (flop monotone)": ["Flop Monotone", "Turn Flush Stays"],
  "River 4-flush (mono flop)": ["Flop Monotone", "Turn Flush Stays"],
  "River Flush Hits (flop rainbow)": ["Flop Rainbow", "Turn BDFD Comes"],
  "River 4-flush (two-tone flop)": ["Flop Two-Tone", "Turn Flush Hits"],
  "River Flush Bricks (flop rainbow)": ["Flop Rainbow", "Turn BDFD Comes"],
  "River Ace Overcard": ["River Broadway"],
  "Turn Ace Overcard": ["Turn Broadway"],
  "River Triple Broadway": ["River Broadway"],
  "River top card pairs (not Ace)": ["River Pairs (not Ace)"],
  "River 2nd card pairs": ["River Pairs (not Ace)"],
  "River 3rd card pairs": ["River Pairs (not Ace)"],
  "River 4th card pairs": ["River Pairs (not Ace)"],
  "River Overcard (not Ace)": ["River Broadway"],
  "Turn Overcard (not Ace)": ["Turn Broadway"],
};

function filterImplied(textures) {
  const implied = new Set(textures.flatMap(t => IMPLIES[t] ?? []));
  return textures.filter(t => !implied.has(t));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns all texture labels for a board.
 * @param {Array<{rank: string, suit: string}>} board - 0–5 card objects
 * @param {{ filterImplied?: boolean }} options
 * @returns {string[]}
 */
export function getBoardTextures(board, { filter = true } = {}) {
  if (!board) return [];
  const cards = board.filter(Boolean).map(encode);
  if (cards.length < 3) return [];
  const out = [];
  if (cards.length >= 3) out.push(...flopTextures(cards.slice(0, 3)));
  if (cards.length >= 4) out.push(...turnTextures(cards.slice(0, 4)));
  if (cards.length === 5) out.push(...riverTextures(cards));
  return filter ? filterImplied(out) : out;
}
