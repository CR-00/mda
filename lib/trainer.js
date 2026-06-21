// Pure logic for the MDA Trainer — building a drill pool from /api/spots docs,
// deriving the action choices for a rep, scoring a pick against the
// EV-maximizing exploitative play, and accumulating session stats.
//
// No React / no fetch here so it can be unit-tested in isolation. The page
// (pages/trainer.jsx) fetches /api/spots for both perspectives and feeds the
// docs straight into buildSpotPool.
//
// The trainer is framed as a simplified game vs a population bot: the aggressor
// is dealt a value hand or a bluff, the defender a bluffcatcher, and the bot
// folds/calls/raises (or bets value/bluff) at the pool's observed frequencies.
// Each rep is scored two ways — the EV verdict (skill, deterministic) and a
// *realized* chip result (the bot's action rolled against those frequencies, so
// a correct call can still lose: "right call, bad run").

// Minimum response sample for a spot/size to be drillable. Matches the
// MIN_FACE_SAMPLE gate used when building defenses in pages/api/spots.js.
export const MIN_SAMPLE = 100;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Incremental EV is preferred when present — it's the EV added by *this* action
// over checking back, which is the right quantity for an exploit decision.
const bluffEvOf = (row) => row.bluff_ev_bb_incremental ?? row.bluff_ev_bb ?? 0;
const valueEvOf = (row) => row.value_ev_bb_incremental ?? row.value_ev_bb ?? 0;

// Whether the spot is dominated by bluffing or value betting, derived from the
// per-size table rather than trusting recommendation.type (which is absent when
// the spot's best line is to check). Drives which EV column scores the sizes.
function dominantType(perSize) {
  let maxBluff = -Infinity;
  let maxValue = -Infinity;
  for (const row of Object.values(perSize)) {
    maxBluff = Math.max(maxBluff, bluffEvOf(row));
    maxValue = Math.max(maxValue, valueEvOf(row));
  }
  return maxBluff >= maxValue ? 'bluff' : 'value';
}

// Does the per-size table actually carry an EV column for this hand category?
// Used to decide whether a spot can deal you a value hand vs a bluff.
function hasCategory(perSize, category) {
  const key1 = category === 'value' ? 'value_ev_bb_incremental' : 'bluff_ev_bb_incremental';
  const key2 = category === 'value' ? 'value_ev_bb' : 'bluff_ev_bb';
  return Object.values(perSize).some(row => (row[key1] ?? row[key2]) != null);
}

/**
 * Flatten 1–2 /api/spots docs (one per perspective) into a normalized list of
 * drill spots. Two kinds:
 *   - 'aggressor' from doc.spots[]   (bet / bluff / barrel decisions)
 *   - 'defender'  from doc.defenses[] (one rep per qualified villain size)
 * Spots below MIN_SAMPLE or missing usable data are dropped.
 */
export function buildSpotPool(docs) {
  const pool = [];
  for (const doc of docs) {
    if (!doc) continue;
    const { bucket, perspective } = doc;

    for (const s of doc.spots ?? []) {
      const perSize = s.per_size;
      if (!perSize || Object.keys(perSize).length === 0) continue;
      if (!s.recommendation) continue;
      if ((s.sample_size ?? 0) < MIN_SAMPLE) continue;
      pool.push({
        id: `aggressor:${perspective}:${s.line}`,
        kind: 'aggressor',
        bucket, perspective,
        street: s.street,
        line: s.line,
        label: s.label,
        potBb: s.pot_bb,
        sample: s.sample_size,
        confidence: s.confidence,
        type: dominantType(perSize),
        perSize,
        recVerb: s.recommendation.verb,
        recBestSize: s.recommendation.best_size,
        recBestEv: s.recommendation.best_ev_bb,
      });
    }

    for (const d of doc.defenses ?? []) {
      for (const size of d.per_size ?? []) {
        if ((size.sample ?? 0) < MIN_SAMPLE) continue;
        if (size.call_ev_bb == null) continue;
        pool.push({
          id: `defender:${perspective}:${d.mirror_line}:${size.bucket}`,
          kind: 'defender',
          bucket, perspective,
          street: 'river',
          line: d.mirror_line,
          label: d.label,
          potBb: d.pot_bb,
          sample: size.sample,
          confidence: size.confidence,
          sizeBucket: size.bucket,
          pctPot: size.pctPot,
          callEvBb: size.call_ev_bb,
        });
      }
    }
  }
  return pool;
}

/**
 * The ordered action options for a rep: { key, label, ev }.
 * Aggressor: Check/give up (0 EV) + one option per bet size, scored on the
 *            dealt hand `category` ('bluff' | 'value'; defaults to the spot's
 *            dominant type). Defender: Fold (0 EV) vs Call (call EV).
 */
export function buildChoices(spot, category = spot.type) {
  if (spot.kind === 'defender') {
    return [
      { key: 'fold', label: 'Fold', ev: 0 },
      { key: 'call', label: 'Call', ev: spot.callEvBb },
    ];
  }
  const evOf = category === 'value' ? valueEvOf : bluffEvOf;
  const choices = [{ key: 'check', label: 'Check / give up', ev: 0 }];
  for (const [size, row] of Object.entries(spot.perSize)) {
    choices.push({ key: size, label: row.label || `Bet ${size}%`, ev: evOf(row) });
  }
  return choices;
}

// Argmax by EV; first option wins ties, so the always-present 0-EV pass
// (check / fold) is the best key whenever no action beats it.
function bestChoice(choices) {
  return choices.reduce((best, c) => (c.ev > best.ev ? c : best), choices[0]);
}

function repScoreFrom(chosenEv, bestEv) {
  if (bestEv > 0) return Math.round(100 * clamp(chosenEv / bestEv, 0, 1));
  // Best line is to pass (0 EV): full marks for not spilling EV, else none.
  return chosenEv >= 0 ? 100 : 0;
}

/**
 * Score a pick against the EV-max option for the dealt hand `category`.
 * Returns { correct, chosenEv, bestEv, evLost, bestKey, repScore }.
 */
export function scoreRep(spot, choiceKey, category = spot.type) {
  const choices = buildChoices(spot, category);
  const chosen = choices.find(c => c.key === choiceKey);
  const best = bestChoice(choices);
  const chosenEv = chosen ? chosen.ev : 0;
  const bestEv = best.ev;
  return {
    correct: choiceKey === best.key,
    chosenEv,
    bestEv,
    evLost: bestEv - chosenEv,
    bestKey: best.key,
    repScore: repScoreFrom(chosenEv, bestEv),
  };
}

// --- dealing & realized resolution (the "game" layer) ---------------------

// Which hand category this rep deals the hero. Defenders always hold a
// bluffcatcher; aggressors are dealt value or a bluff among the categories the
// per-size table can actually score (falls back to the dominant type).
function pickCategory(spot, rng) {
  if (spot.kind === 'defender') return 'bluffcatcher';
  const cands = ['bluff', 'value'].filter(t => hasCategory(spot.perSize, t));
  const pool = cands.length ? cands : [spot.type];
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Deal a fresh rep — just the hand category the hero holds (value / bluff for
 * the aggressor, bluffcatcher for the defender). The data is board-agnostic, so
 * the rep is defined by the hand *class*, not specific cards.
 */
export function dealRep(spot, { rng = Math.random } = {}) {
  return { category: pickCategory(spot, rng) };
}

// Size buckets aren't always plain numbers — e.g. "200+" means 200%-pot-or-more.
// parseFloat grabs the leading number; Number() would return NaN and poison EV.
const sizeFrac = (key) => {
  const p = parseFloat(key);
  return Number.isFinite(p) ? p / 100 : 0;
};
const betOf = (spot, choiceKey) =>
  spot.kind === 'defender'
    ? (Number.isFinite(spot.pctPot) ? spot.pctPot : sizeFrac(spot.sizeBucket)) * (spot.potBb ?? 0)
    : sizeFrac(choiceKey) * (spot.potBb ?? 0);

/**
 * Roll the bot's response against the population frequencies and return the
 * realized chip result of the hero's action (in bb), plus what the bot did.
 *   aggressor → { botAction:'fold'|'call'|'raise'|'check', bet, realized }
 *   defender  → { botHand:'bluff'|'value', bet, realized }
 * This is the *immediate* steal/showdown outcome of one sampled hand — it's the
 * variance/drama layer. It is directionally consistent with the pool's EV but
 * deliberately not a precise estimator of it (the reported EV also folds in
 * multi-street continuation value); the EV verdict from scoreRep is the truth.
 */
export function resolveRealized(spot, choiceKey, category, { rng = Math.random } = {}) {
  const fin = v => (Number.isFinite(v) ? v : 0);
  const pot = spot.potBb ?? 0;

  if (spot.kind === 'defender') {
    const b = betOf(spot, choiceKey);
    // Implied pool bluff frequency consistent with the reported call EV:
    // callEv = q(pot+b) - (1-q)b  ⇒  q = (callEv + b) / (pot + 2b).
    const q = clamp((spot.callEvBb + b) / (pot + 2 * b || 1), 0, 1);
    const botHand = rng() < q ? 'bluff' : 'value';
    const showdown = choiceKey === 'call'; // calling reaches showdown; folding doesn't
    const realized = choiceKey === 'fold' ? 0 : (botHand === 'bluff' ? pot + b : -b);
    // Expectation of the realized outcome (variance removed). By construction of
    // q, E[call] = q(pot+b) - (1-q)b = callEvBb exactly.
    const evRealized = choiceKey === 'fold' ? 0 : spot.callEvBb;
    return { botHand, bet: fin(b), realized: fin(realized), showdown, evRealized: fin(evRealized) };
  }

  if (choiceKey === 'check') return { botAction: 'check', bet: 0, realized: 0, showdown: false, evRealized: 0 };

  const row = spot.perSize[choiceKey] || {};
  const b = betOf(spot, choiceKey);
  const bf = row.bf ?? 0, bc = row.bc ?? 0, br = row.br ?? 0;
  const total = bf + bc + br || 1;
  const pf = bf / total, pCallRaise = (bc + br) / total;
  const u = rng() * total;
  const botAction = u < bf ? 'fold' : u < bf + bc ? 'call' : 'raise';

  let realized, evRealized;
  if (category === 'value') {
    realized = botAction === 'fold' ? 0 : b; // they pay off (call/raise→you win it back)
    evRealized = pCallRaise * b;
  } else { // bluff
    realized = botAction === 'fold' ? pot : -b; // steal the pot, or get looked up
    evRealized = pf * pot - pCallRaise * b;
  }
  // Showdown = cards get compared: a call, or a value hand that calls a raise.
  const showdown = botAction === 'call' || (botAction === 'raise' && category === 'value');
  return { botAction, bet: fin(b), realized: fin(realized), showdown, evRealized: fin(evRealized) };
}

/**
 * Play a full rep: score the pick (EV/skill) and roll the bot's response for a
 * realized chip result. Returns the merged record consumed by applyRep + UI.
 */
export function playRep(spot, choiceKey, category = spot.type, { rng = Math.random } = {}) {
  const score = scoreRep(spot, choiceKey, category);
  const outcome = resolveRealized(spot, choiceKey, category, { rng });
  return { ...score, ...outcome, pickKey: choiceKey, category };
}

/**
 * Headless batch: simulate `count` hands over the pool with no UI/animation and
 * return the array of rep results (each carries realized/evRealized/showdown +
 * the EV verdict). `optimal` plays the EV-max line every hand; otherwise random.
 * Pure and fast — the page folds the results into stats/history in one update.
 */
export function runBatch(pool, count, { rng = Math.random, optimal = true } = {}) {
  const results = [];
  if (!pool || !pool.length) return results;
  let prev = null;
  for (let i = 0; i < count; i++) {
    const spot = pickRandomSpot(pool, { rng, avoid: prev });
    if (!spot) break;
    prev = spot;
    const { category } = dealRep(spot, { rng });
    const choices = buildChoices(spot, category);
    const key = optimal
      ? choices.reduce((b, c) => (c.ev > b.ev ? c : b), choices[0]).key
      : choices[Math.floor(rng() * choices.length)].key;
    results.push(playRep(spot, key, category, { rng }));
  }
  return results;
}

/** Pick a random spot, avoiding the one in `avoid` when possible. */
export function pickRandomSpot(pool, { rng = Math.random, avoid = null } = {}) {
  if (!pool.length) return null;
  let candidates = avoid ? pool.filter(s => s.id !== avoid.id) : pool;
  if (!candidates.length) candidates = pool;
  return candidates[Math.floor(rng() * candidates.length)];
}

export function emptyStats() {
  return {
    reps: 0, correct: 0, accuracy: 0, totalEvLost: 0, totalBestEv: 0, evEfficiency: 1,
    realized: 0, showdown: 0, nonShowdown: 0, evReal: 0,
  };
}

/** Fold a rep result into the running session stats (pure — returns a new object). */
export function applyRep(stats, result) {
  const fin = v => (Number.isFinite(v) ? v : 0);
  const reps = stats.reps + 1;
  const correct = stats.correct + (result.correct ? 1 : 0);
  const totalEvLost = stats.totalEvLost + fin(result.evLost);
  const totalBestEv = stats.totalBestEv + fin(result.bestEv);
  const realized = fin(result.realized);
  return {
    reps,
    correct,
    accuracy: correct / reps,
    totalEvLost,
    totalBestEv,
    evEfficiency: totalBestEv > 0 ? (totalBestEv - totalEvLost) / totalBestEv : 1,
    realized: (stats.realized ?? 0) + realized,
    showdown: (stats.showdown ?? 0) + (result.showdown ? realized : 0),
    nonShowdown: (stats.nonShowdown ?? 0) + (result.showdown ? 0 : realized),
    evReal: (stats.evReal ?? 0) + fin(result.evRealized),
  };
}
