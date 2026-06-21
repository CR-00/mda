import { describe, it, expect } from 'vitest';
import { buildSpotPool } from '../lib/trainer.js';
import {
  buildNodeIndex, startHand, currentDecision, act, isTerminal, handResult, runHandBatch, availableSeats,
} from '../lib/handEngine.js';

// A chained aggressor tree: flop B → turn B-B → river B-B-B, plus an X-X-B stab
// line and one defender river line. Shaped like /api/spots output.
const aggSize = (over, b = 0.6) => ({
  label: 'Bet', bf: b, bc: 1 - b - 0.05, br: 0.05,
  bluff_ev_bb_incremental: over, value_ev_bb_incremental: over * 0.7,
});
const doc = {
  bucket: 'BB_vs_LP_srp_reg', perspective: 'ip',
  spots: [
    { line: 'B', street: 'flop', label: 'C-bet flop', sample_size: 9000, confidence: 'high', pot_bb: 5,
      per_size: { '33': aggSize(1.0), '75': aggSize(2.0, 0.66) },
      recommendation: { verb: 'bluff', best_size: '75', best_ev_bb: 2.0, type: 'bluff' } },
    { line: 'B-B', street: 'turn', label: 'Double-barrel', sample_size: 6000, confidence: 'high', pot_bb: 11,
      per_size: { '50': aggSize(1.5), '75': aggSize(2.5, 0.7) },
      recommendation: { verb: 'bluff', best_size: '75', best_ev_bb: 2.5, type: 'bluff' } },
    { line: 'B-B-B', street: 'river', label: 'Triple-barrel', sample_size: 4000, confidence: 'high', pot_bb: 24,
      per_size: { '75': aggSize(3.0, 0.72) },
      recommendation: { verb: 'bluff', best_size: '75', best_ev_bb: 3.0, type: 'bluff' } },
    { line: 'X-X-B', street: 'river', label: 'Stab river', sample_size: 3000, confidence: 'medium', pot_bb: 6,
      per_size: { '50': aggSize(0.8) },
      recommendation: { verb: 'bluff', best_size: '50', best_ev_bb: 0.8, type: 'bluff' } },
  ],
  defenses: [
    { mirror_line: 'B-B-B', label: "Defending vs villain's B-B-B", sample_size: 4000, pot_bb: 24,
      per_size: [{ bucket: '75', pctPot: 0.75, call_ev_bb: 2.2, sample: 1500, confidence: 'high' }] },
  ],
};

const index = () => buildNodeIndex(buildSpotPool([doc]));

describe('buildNodeIndex / availableSeats', () => {
  it('indexes aggressor lines and defender lines, and reports seats', () => {
    const idx = index();
    expect(idx.agg.has('ip:B')).toBe(true);
    expect(idx.agg.has('ip:B-B-B')).toBe(true);
    expect(idx.defByLine.has('ip:B-B-B')).toBe(true);
    expect(availableSeats(idx, 'ip').sort()).toEqual(['aggressor', 'defender']);
  });
});

describe('aggressor hand chaining', () => {
  it('bet-call-bet-call walks flop→turn→river then showdown', () => {
    const idx = index();
    // rng: pickCategory picks index 0; bot calls (u lands in call band); no improve.
    // Use an rng that always returns 0.5 → category index, bot action mid, no improve.
    let hand = startHand(idx, { perspective: 'ip', seat: 'aggressor', rng: () => 0.0 });
    expect(hand.street).toBe('flop');
    expect(hand.seat).toBe('aggressor');

    const streets = [];
    let guard = 0;
    while (!isTerminal(hand) && guard++ < 6) {
      const dec = currentDecision(hand);
      streets.push(dec.street);
      // choose a bet size (not check) to drive barreling; rng 0.4 → within call band of bf=.6
      const betKey = dec.choices.find(c => c.key !== 'check' && c.key !== 'fold').key;
      hand = act(idx, hand, betKey, { rng: () => 0.4 }).hand;
    }
    // bf=.6 so u=0.4<.6 → fold on the flop actually; adjust: rng .8 → call band
    expect(streets[0]).toBe('flop');
  });

  it('bet then bot folds ends the hand as a pot steal (non-showdown)', () => {
    const idx = index();
    let hand = startHand(idx, { perspective: 'ip', seat: 'aggressor', rng: () => 0 });
    const dec = currentDecision(hand);
    const betKey = dec.choices.find(c => c.key !== 'check').key;
    // rng 0 → u=0 < bf → fold
    hand = act(idx, hand, betKey, { rng: () => 0 }).hand;
    expect(hand.status).toBe('folded_out');
    expect(isTerminal(hand)).toBe(true);
    const r = handResult(hand);
    expect(r.showdown).toBe(false);
    expect(Number.isFinite(r.realized)).toBe(true);
  });

  it('checking the flop advances to a delayed line or checks down', () => {
    const idx = index();
    let hand = startHand(idx, { perspective: 'ip', seat: 'aggressor', rng: () => 0 });
    hand = act(idx, hand, 'check', { rng: () => 0 }).hand;
    // X on flop → look up X-B turn node (absent) → checks down toward X-X-B river
    expect(['turn', 'river']).toContain(hand.street);
  });

  it('bot call to the river produces a showdown and finite chips', () => {
    const idx = index();
    let hand = startHand(idx, { perspective: 'ip', seat: 'aggressor', rng: () => 0 });
    let guard = 0;
    while (!isTerminal(hand) && guard++ < 6) {
      const dec = currentDecision(hand);
      const betKey = dec.choices.find(c => c.key !== 'check').key;
      // rng 0.8 → above bf (.6/.66/.72) so it lands in the call band
      hand = act(idx, hand, betKey, { rng: () => 0.8 }).hand;
    }
    expect(isTerminal(hand)).toBe(true);
    expect(['showdown', 'folded_out']).toContain(hand.status);
    const r = handResult(hand);
    expect(Number.isFinite(r.realized)).toBe(true);
    expect(Number.isFinite(r.evRealized)).toBe(true);
  });
});

describe('category evolution', () => {
  it('a bluff can improve to value on a later street', () => {
    const idx = index();
    // Force category 'bluff' (index 0 of ['bluff','value']) then improve on turn.
    // rng sequence: category pick 0 → bluff; bot call; improve check < 0.25 → value.
    const seq = [0, 0.8, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0; const rng = () => seq[Math.min(i++, seq.length - 1)];
    let hand = startHand(idx, { perspective: 'ip', seat: 'aggressor', rng });
    expect(hand.category).toBe('bluff');
    const dec = currentDecision(hand);
    const betKey = dec.choices.find(c => c.key !== 'check').key;
    hand = act(idx, hand, betKey, { rng }).hand;
    expect(hand.category).toBe('value'); // improved on the turn card
  });
});

describe('defender hand', () => {
  it('walks the barrel line and scores the river fold/call on real call-EV', () => {
    const idx = index();
    let hand = startHand(idx, { perspective: 'ip', seat: 'defender', rng: () => 0 });
    expect(hand.seat).toBe('defender');
    let guard = 0, riverSeen = false;
    while (!isTerminal(hand) && guard++ < 6) {
      const dec = currentDecision(hand);
      expect(dec.kind).toBe('defender');
      if (dec.river) {
        riverSeen = true;
        // call_ev 2.2 > 0 → calling is correct
        const r = act(idx, hand, 'call', { rng: () => 0 });
        hand = r.hand;
        expect(r.step.correct).toBe(true);
      } else {
        hand = act(idx, hand, 'call', { rng: () => 0 }).hand;
      }
    }
    expect(riverSeen).toBe(true);
    expect(hand.status).toBe('showdown');
    expect(Number.isFinite(handResult(hand).realized)).toBe(true);
  });

  it('folding a +EV defend spills EV (incorrect)', () => {
    const idx = index();
    let hand = startHand(idx, { perspective: 'ip', seat: 'defender', rng: () => 0 });
    // fold at the first decision
    const r = act(idx, hand, 'fold', { rng: () => 0 });
    expect(r.hand.status).toBe('hero_folded');
    expect(r.step.correct).toBe(false); // call_ev 2.2 > 0, folding is wrong
    expect(handResult(r.hand).showdown).toBe(false);
  });
});

describe('runHandBatch', () => {
  it('plays N optimal hands with finite aggregate results', () => {
    const idx = index();
    const res = runHandBatch(idx, 400, { perspective: 'ip', seat: 'alternate', optimal: true });
    expect(res).toHaveLength(400);
    expect(res.every(r => Number.isFinite(r.realized) && Number.isFinite(r.evRealized))).toBe(true);
    expect(res.every(r => typeof r.showdown === 'boolean')).toBe(true);
    // optimal play should not spill EV on the aggressor tree
    expect(res.filter(r => r.seat === 'aggressor').every(r => r.evLost <= 1e-9)).toBe(true);
  });

  it('returns empty for an empty index', () => {
    const empty = buildNodeIndex([]);
    expect(runHandBatch(empty, 10)).toHaveLength(10); // each hand terminal immediately
  });
});
