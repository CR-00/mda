// Multi-street hand engine for the MDA Trainer.
//
// A *hand* is a walk over a sequence of single-street decisions: each street's
// decision is just a "spot" (a population bet-node), so we reuse the scoring
// primitives from trainer.js (buildChoices / scoreRep / resolveRealized) at
// every step and accumulate the results across the hand. One finished hand
// aggregates into a single rep record — so the session graph / stats / autoplay
// keep working unchanged (one hand = one rep).
//
// Seat model (configurable per session, can alternate per hand):
//   - aggressor: hero drives. Each street: check or bet-a-size; the bot folds /
//     calls / raises at population frequency. Bet→fold wins the pot; bet→call
//     advances (line extends B→B-B→B-B-B, or X-B for a delayed line); a raise
//     ends the hand at that street. Fully backed by the bet-node data.
//   - defender: hero holds a bluffcatcher and the bot barrels. Honest data
//     limit: only the RIVER facing decision has real call-EV, so the river is
//     the rigorously-scored fold/call; earlier streets are fold (give up) vs
//     call (continue), referenced to the line's river call-EV.
//
// Hands evolve: a bluff can improve to value as later cards fall (a draw gets
// there), which then scores on the value-EV column. Cards are flavor only.

import { buildChoices, scoreRep, resolveRealized } from './trainer.js';

export const STREETS = ['flop', 'turn', 'river'];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];
const dealCard = (rng) => RANKS[Math.floor(rng() * 13)] + SUITS[Math.floor(rng() * 4)];

// Probability a bluff/draw improves to value on the new card.
const IMPROVE = { turn: 0.25, river: 0.20 };
const evolveCategory = (cat, street, rng) =>
  (cat === 'bluff' && rng() < (IMPROVE[street] || 0)) ? 'value' : cat;

// The bet-node line to look up when the hero bets the current street: hero's
// resolved action letters so far, plus 'B' for this street's bet.
const betLineFor = (actions) => [...actions, 'B'].join('-');

function aggHasCategory(perSize, category) {
  const k1 = category === 'value' ? 'value_ev_bb_incremental' : 'bluff_ev_bb_incremental';
  const k2 = category === 'value' ? 'value_ev_bb' : 'bluff_ev_bb';
  return Object.values(perSize).some(r => (r[k1] ?? r[k2]) != null);
}
function pickAggCategory(spot, rng) {
  const cands = ['bluff', 'value'].filter(c => aggHasCategory(spot.perSize, c));
  const pool = cands.length ? cands : [spot.type];
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Index the normalized pool (from buildSpotPool) for fast line lookups.
 *   agg:       Map `${persp}:${line}`      -> aggressor spot (a bet-node)
 *   defByLine: Map `${persp}:${mirrorLine}`-> [defender spots, one per size]
 */
export function buildNodeIndex(pool) {
  const agg = new Map();
  const defByLine = new Map();
  for (const s of pool || []) {
    if (s.kind === 'aggressor') {
      agg.set(`${s.perspective}:${s.line}`, s);
    } else {
      const k = `${s.perspective}:${s.line}`;
      if (!defByLine.has(k)) defByLine.set(k, []);
      defByLine.get(k).push(s);
    }
  }
  return { agg, defByLine };
}

/** Which seats can actually be dealt for a perspective given the data present. */
export function availableSeats(index, perspective) {
  const seats = [];
  if ([...index.agg.keys()].some(k => k.startsWith(`${perspective}:`))) seats.push('aggressor');
  if ([...index.defByLine.keys()].some(k => k.startsWith(`${perspective}:`))) seats.push('defender');
  return seats;
}

/** Perspectives present in the index (ip / oop). */
export function allPerspectives(index) {
  const set = new Set();
  for (const k of index.agg.keys()) set.add(k.split(':')[0]);
  for (const k of index.defByLine.keys()) set.add(k.split(':')[0]);
  return [...set];
}

function baseHand(extra) {
  return {
    realized: 0, evRealized: 0, evLost: 0, bestEv: 0, correct: true, scored: 0,
    steps: [], runout: [], status: 'live', pot: 0, pending: null,
    ...extra,
  };
}

function startAggressor(index, perspective, rng) {
  // Prefer the flop c-bet root 'B'; fall back to any flop bet-node for this persp.
  let spot = index.agg.get(`${perspective}:B`);
  if (!spot) {
    const k = [...index.agg.keys()].find(key => key.startsWith(`${perspective}:`) &&
      !index.agg.get(key).line.includes('-'));
    spot = k ? index.agg.get(k) : null;
  }
  const category = spot ? pickAggCategory(spot, rng) : 'bluff';
  return baseHand({
    perspective, seat: 'aggressor', bucket: spot?.bucket,
    street: 'flop', actions: [], category, initialCategory: category,
    pot: spot?.potBb ?? 0,
    pending: spot ? { kind: 'aggressor', spot } : null,
    status: spot ? 'live' : 'showdown',
  });
}

function startDefender(index, perspective, rng) {
  const keys = [...index.defByLine.keys()].filter(k => k.startsWith(`${perspective}:`));
  if (!keys.length) return baseHand({ perspective, seat: 'defender', street: 'river', status: 'showdown' });
  const key = keys[Math.floor(rng() * keys.length)];
  const sizes = index.defByLine.get(key);
  const riverSpot = sizes[Math.floor(rng() * sizes.length)];
  const mirrorLine = riverSpot.line;

  // Decode which streets the bot bet (a clean 'B' segment), so the hand can walk
  // flop→turn→river presenting the bot's barrels. The final segment is the
  // river bet the hero faces (real call-EV).
  const segs = mirrorLine.split('-');
  const names = STREETS.slice(STREETS.length - segs.length); // align to the right
  const betStreets = new Set();
  segs.forEach((seg, i) => { if (seg === 'B' || i === segs.length - 1) betStreets.add(names[i]); });

  const startStreet = names[0];
  const hand = baseHand({
    perspective, seat: 'defender', bucket: riverSpot.bucket,
    street: startStreet, actions: [], category: 'bluffcatcher', initialCategory: 'bluffcatcher',
    pot: riverSpot.potBb ?? 0,
    mirrorLine, betStreets, riverSpot, riverCallEv: riverSpot.callEvBb,
  });
  hand.pending = defenderPending(hand);
  hand.status = hand.pending ? 'live' : 'showdown';
  return hand;
}

// The defender's decision spot for the current street, or null if the bot didn't
// bet this street (nothing to face — auto-advance through it).
function defenderPending(hand) {
  if (!hand.betStreets?.has(hand.street)) return null;
  const isRiver = hand.street === 'river';
  // River uses the real facing spot; earlier streets reference the line's river
  // call-EV (the value of defending this barrel line) as an honest stand-in.
  const spot = isRiver ? hand.riverSpot : {
    kind: 'defender', perspective: hand.perspective, bucket: hand.bucket,
    line: hand.mirrorLine, label: hand.riverSpot.label, street: hand.street,
    potBb: hand.pot, sizeBucket: hand.riverSpot.sizeBucket,
    pctPot: hand.riverSpot.pctPot, callEvBb: hand.riverCallEv,
  };
  return { kind: 'defender', spot, river: isRiver };
}

/**
 * Start a fresh hand. `seat` and `perspective` each accept 'alternate' to pick
 * randomly from what the data supports.
 */
export function startHand(index, { perspective = 'alternate', seat = 'alternate', rng = Math.random } = {}) {
  let persp = perspective;
  if (persp === 'alternate' || persp === 'both') {
    const all = allPerspectives(index);
    persp = all.length ? all[Math.floor(rng() * all.length)] : 'ip';
  }
  let s = seat;
  if (seat === 'alternate') {
    const avail = availableSeats(index, persp);
    s = avail.length ? avail[Math.floor(rng() * avail.length)] : 'aggressor';
  }
  return s === 'defender' ? startDefender(index, persp, rng) : startAggressor(index, persp, rng);
}

/** The decision the hero must make right now, or null when the hand is over. */
export function currentDecision(hand) {
  if (hand.status !== 'live' || !hand.pending) return null;
  const { spot, kind } = hand.pending;
  if (kind === 'aggressor') {
    return { kind, street: hand.street, spot, category: hand.category, choices: buildChoices(spot, hand.category) };
  }
  return { kind, street: hand.street, spot, river: hand.pending.river, category: 'bluffcatcher', choices: buildChoices(spot) };
}

export const isTerminal = (hand) => hand.status !== 'live' || !hand.pending;

// Roll past streets the bot checked (defender) until the next decision or the
// end of the hand. Deals flavor cards / evolves nothing for the defender.
function advanceDefender(hand, rng) {
  while (true) {
    const i = STREETS.indexOf(hand.street);
    if (i >= STREETS.length - 1) { hand.status = 'showdown'; hand.pending = null; return; }
    hand.street = STREETS[i + 1];
    hand.runout.push({ street: hand.street, card: dealCard(rng), note: hand.betStreets.has(hand.street) ? 'bot bets' : 'bot checks' });
    const pend = defenderPending(hand);
    if (pend) { hand.pending = pend; return; }
  }
}

function actAggressor(index, hand, dec, key, rng) {
  const next = { ...hand, steps: [...hand.steps], runout: [...hand.runout], actions: [...hand.actions] };
  const score = scoreRep(dec.spot, key, hand.category);
  const out = resolveRealized(dec.spot, key, hand.category, { rng });
  const step = {
    street: hand.street, kind: 'aggressor', category: hand.category,
    choiceKey: key, label: dec.choices.find(c => c.key === key)?.label,
    ...score, ...out, line: dec.spot.line,
  };
  next.steps.push(step);
  next.realized += out.realized; next.evRealized += out.evRealized;
  next.evLost += score.evLost; next.bestEv += score.bestEv;
  next.correct = next.correct && score.correct; next.scored += 1;

  const toNextStreet = () => {
    const i = STREETS.indexOf(next.street);
    if (i >= STREETS.length - 1) { next.status = 'showdown'; next.pending = null; return; }
    next.street = STREETS[i + 1];
    next.category = evolveCategory(next.category, next.street, rng);
    next.runout.push({ street: next.street, card: dealCard(rng), category: next.category });
    const spot = index.agg.get(`${next.perspective}:${betLineFor(next.actions)}`);
    next.pending = spot ? { kind: 'aggressor', spot } : null;
    if (!spot) { // no data to bet here — check it down to the next street
      next.actions.push('X');
      toNextStreet();
    }
  };

  if (key === 'check') {
    next.actions.push('X');
    toNextStreet();
  } else if (out.botAction === 'fold') {
    next.status = 'folded_out'; next.pending = null; // hero wins the pot
  } else if (out.botAction === 'raise') {
    next.status = 'showdown'; next.pending = null;   // face the raise → hand ends here
  } else { // called
    next.actions.push('B');
    next.pot += 2 * (out.bet || 0);
    toNextStreet();
  }
  return { hand: next, step };
}

function actDefender(hand, dec, key, rng) {
  const next = { ...hand, steps: [...hand.steps], runout: [...hand.runout] };
  // EV is only scored on the river decision (the one real call-EV); earlier
  // streets are continue/give-up referenced to it but not double-counted.
  const score = scoreRep(dec.spot, key, 'bluffcatcher');
  const out = resolveRealized(dec.spot, key, 'bluffcatcher', { rng });
  const step = {
    street: hand.street, kind: 'defender', category: 'bluffcatcher',
    choiceKey: key, label: dec.choices.find(c => c.key === key)?.label,
    ...score, ...out, river: dec.river, line: dec.spot.line,
  };
  next.steps.push(step);

  if (key === 'fold') {
    // Give up now. Score the give-up vs the line's defend value (counted once).
    next.evLost += score.evLost; next.bestEv += score.bestEv; next.scored += 1;
    next.correct = next.correct && score.correct;
    next.status = 'hero_folded'; next.pending = null;
    return { hand: next, step };
  }

  // Called.
  if (dec.river) {
    next.realized += out.realized; next.evRealized += out.evRealized;
    next.evLost += score.evLost; next.bestEv += score.bestEv; next.scored += 1;
    next.correct = next.correct && score.correct;
    next.botHand = out.botHand;
    next.status = 'showdown'; next.pending = null;
    return { hand: next, step };
  }
  // Continue to the next bot bet / showdown (earlier streets: no chips/EV yet).
  advanceDefender(next, rng);
  return { hand: next, step };
}

/** Apply the hero's chosen action; returns { hand: nextHand, step }. */
export function act(index, hand, choiceKey, { rng = Math.random } = {}) {
  const dec = currentDecision(hand);
  if (!dec) return { hand, step: null };
  return dec.kind === 'aggressor'
    ? actAggressor(index, hand, dec, choiceKey, rng)
    : actDefender(hand, dec, choiceKey, rng);
}

/**
 * Aggregate a finished hand into a single rep record for applyRep / the graph.
 * showdown flag = the hand was decided at a showdown (river call), not a fold.
 */
export function handResult(hand) {
  const bestEv = hand.bestEv;
  const captured = bestEv > 0 ? Math.max(0, (bestEv - hand.evLost)) / bestEv : (hand.evLost <= 0 ? 1 : 0);
  return {
    realized: hand.realized,
    evRealized: hand.evRealized,
    showdown: hand.status === 'showdown',
    evLost: hand.evLost,
    bestEv: hand.bestEv,
    correct: hand.correct,
    repScore: Math.round(100 * captured),
    seat: hand.seat,
    status: hand.status,
  };
}

/**
 * Headless batch: play `count` full hands (optimal by default) and return the
 * array of aggregate rep records. Pure and fast — folds into stats in one pass.
 */
export function runHandBatch(index, count, { perspective = 'alternate', seat = 'alternate', rng = Math.random, optimal = true } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let hand = startHand(index, { perspective, seat, rng });
    let guard = 0;
    while (!isTerminal(hand) && guard++ < 12) {
      const dec = currentDecision(hand);
      const key = optimal
        ? dec.choices.reduce((b, c) => (c.ev > b.ev ? c : b), dec.choices[0]).key
        : dec.choices[Math.floor(rng() * dec.choices.length)].key;
      hand = act(index, hand, key, { rng }).hand;
    }
    out.push(handResult(hand));
  }
  return out;
}
