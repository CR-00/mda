import { describe, it, expect } from 'vitest';
import {
  MIN_SAMPLE,
  buildSpotPool,
  buildChoices,
  scoreRep,
  pickRandomSpot,
  emptyStats,
  applyRep,
  dealRep,
  resolveRealized,
  playRep,
  runBatch,
} from '../lib/trainer.js';

// --- fixtures shaped like /api/spots output -------------------------------

// Aggressor spot where betting 75% is the +EV exploit (pop overfolds), small
// size is -EV, and checking (0) is worse than the best bet.
const aggDoc = {
  bucket: 'BB_vs_LP_srp_reg',
  perspective: 'ip',
  spots: [
    {
      line: 'B-B-B', street: 'river', label: 'Triple-barrel river',
      sample_size: 5000, confidence: 'high', pot_bb: 12,
      per_size: {
        '33': { label: 'Bet 33%', bf: 0.4, bc: 0.55, br: 0.05, overfold_pp: -2, bluff_ev_bb_incremental: -0.5, value_ev_bb_incremental: 0.3 },
        '75': { label: 'Bet 75%', bf: 0.62, bc: 0.33, br: 0.05, overfold_pp: 8, bluff_ev_bb_incremental: 1.8, value_ev_bb_incremental: 1.1 },
      },
      recommendation: { verb: 'bluff', best_size: '75', best_ev_bb: 1.8, type: 'bluff' },
    },
    // Dropped: below sample.
    {
      line: 'X-X-B', street: 'river', label: 'Stab river',
      sample_size: 20, confidence: 'low', pot_bb: 6,
      per_size: { '50': { label: 'Bet 50%', bf: 0.5, bc: 0.5, br: 0, bluff_ev_bb: 0.2 } },
      recommendation: { verb: 'bluff', best_size: '50', best_ev_bb: 0.2 },
    },
    // Dropped: no recommendation.
    {
      line: 'C-B', street: 'turn', label: 'Bet after calling',
      sample_size: 9000, confidence: 'high', pot_bb: 8,
      per_size: { '50': { label: 'Bet 50%', bf: 0.5, bc: 0.5, br: 0, bluff_ev_bb: 0.2 } },
      recommendation: null,
    },
  ],
  defenses: [
    {
      mirror_line: 'B-B-B', label: "Defending vs villain's B-B-B",
      sample_size: 4000, pot_bb: 20,
      per_size: [
        { bucket: '75', pctPot: 0.74, call_ev_bb: 2.5, sample: 1500, confidence: 'high' },
        { bucket: '125', pctPot: 1.2, call_ev_bb: -1.4, sample: 800, confidence: 'medium' },
        { bucket: '50', pctPot: 0.5, call_ev_bb: 0.3, sample: 30, confidence: 'low' }, // dropped: sample < MIN
      ],
    },
  ],
};

// "Check is best" spot — every bet size is -EV.
const checkBestDoc = {
  bucket: 'BB_vs_LP_srp_reg',
  perspective: 'oop',
  spots: [
    {
      line: 'X-X-B', street: 'river', label: 'Stab river',
      sample_size: 3000, confidence: 'medium', pot_bb: 7,
      per_size: {
        '50': { label: 'Bet 50%', bf: 0.3, bc: 0.7, br: 0, bluff_ev_bb_incremental: -0.9, value_ev_bb_incremental: -0.4 },
      },
      recommendation: { verb: 'check / give up', best_size: null, best_ev_bb: -0.4 },
    },
  ],
  defenses: [],
};

describe('buildSpotPool', () => {
  it('keeps qualified spots and drops below-sample / no-recommendation ones', () => {
    const pool = buildSpotPool([aggDoc]);
    const aggressors = pool.filter(s => s.kind === 'aggressor');
    expect(aggressors).toHaveLength(1);
    expect(aggressors[0].line).toBe('B-B-B');
    expect(aggressors[0].type).toBe('bluff'); // bluff EV dominates
  });

  it('expands each qualified defender size into its own drill spot', () => {
    const pool = buildSpotPool([aggDoc]);
    const defenders = pool.filter(s => s.kind === 'defender');
    expect(defenders.map(d => d.sizeBucket).sort()).toEqual(['125', '75']); // 50% dropped (sample 30)
  });

  it('merges multiple perspective docs and tolerates nulls', () => {
    const pool = buildSpotPool([aggDoc, null, checkBestDoc]);
    expect(pool.some(s => s.perspective === 'ip')).toBe(true);
    expect(pool.some(s => s.perspective === 'oop')).toBe(true);
  });

  it('uses MIN_SAMPLE as the gate', () => {
    expect(MIN_SAMPLE).toBe(100);
  });
});

describe('buildChoices', () => {
  it('aggressor: check + a bet option per size, scored on dominant type', () => {
    const spot = buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');
    const choices = buildChoices(spot);
    expect(choices[0]).toEqual({ key: 'check', label: 'Check / give up', ev: 0 });
    const bet75 = choices.find(c => c.key === '75');
    expect(bet75.ev).toBeCloseTo(1.8); // bluff incremental EV
  });

  it('defender: fold vs call', () => {
    const spot = buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '75');
    expect(buildChoices(spot)).toEqual([
      { key: 'fold', label: 'Fold', ev: 0 },
      { key: 'call', label: 'Call', ev: 2.5 },
    ]);
  });
});

describe('scoreRep', () => {
  const aggSpot = () => buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');

  it('correct pick → no EV lost, full score', () => {
    const r = scoreRep(aggSpot(), '75');
    expect(r.correct).toBe(true);
    expect(r.bestKey).toBe('75');
    expect(r.evLost).toBeCloseTo(0);
    expect(r.repScore).toBe(100);
  });

  it('wrong pick → positive EV lost, partial score', () => {
    const r = scoreRep(aggSpot(), 'check');
    expect(r.correct).toBe(false);
    expect(r.evLost).toBeCloseTo(1.8);
    expect(r.repScore).toBe(0); // captured 0 of 1.8
  });

  it('check-is-best: betting a -EV size loses, checking scores full', () => {
    const spot = buildSpotPool([checkBestDoc]).find(s => s.kind === 'aggressor');
    expect(scoreRep(spot, 'check')).toMatchObject({ correct: true, bestKey: 'check', repScore: 100 });
    // Dominant type here is 'value' (-0.4 beats -0.9), so the size is scored on
    // value EV — still -EV, so checking back is the right call.
    const bet = scoreRep(spot, '50');
    expect(bet.correct).toBe(false);
    expect(bet.evLost).toBeCloseTo(0.4);
    expect(bet.repScore).toBe(0);
  });

  it('defender: calling a +EV spot is correct; folding spills the call EV', () => {
    const callSpot = buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '75');
    expect(scoreRep(callSpot, 'call')).toMatchObject({ correct: true, repScore: 100 });
    expect(scoreRep(callSpot, 'fold').evLost).toBeCloseTo(2.5);

    const foldSpot = buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '125');
    expect(scoreRep(foldSpot, 'fold')).toMatchObject({ correct: true, repScore: 100 });
  });
});

describe('applyRep / stats', () => {
  it('accumulates reps, accuracy and EV efficiency', () => {
    const spot = buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');
    let stats = emptyStats();
    stats = applyRep(stats, scoreRep(spot, '75'));   // correct, +1.8 best, 0 lost
    stats = applyRep(stats, scoreRep(spot, 'check')); // wrong, +1.8 best, 1.8 lost
    expect(stats.reps).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.accuracy).toBeCloseTo(0.5);
    expect(stats.totalEvLost).toBeCloseTo(1.8);
    expect(stats.totalBestEv).toBeCloseTo(3.6);
    expect(stats.evEfficiency).toBeCloseTo(0.5);
  });
});

describe('dealRep', () => {
  const aggSpot = () => buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');
  const defSpot = () => buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '75');

  it('aggressor is dealt a value hand or a bluff', () => {
    const rep = dealRep(aggSpot(), { rng: () => 0 });
    expect(['bluff', 'value']).toContain(rep.category);
  });

  it('defender always holds a bluffcatcher', () => {
    expect(dealRep(defSpot(), { rng: () => 0.5 }).category).toBe('bluffcatcher');
  });
});

describe('resolveRealized', () => {
  const aggSpot = () => buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor'); // B-B-B, pot 12
  const defCall = () => buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '75'); // pot 20

  it('bluff that gets through wins the pot; that gets looked up loses the bet', () => {
    const folded = resolveRealized(aggSpot(), '75', 'bluff', { rng: () => 0 });      // u=0 < bf → fold
    expect(folded).toMatchObject({ botAction: 'fold', realized: 12 });
    const called = resolveRealized(aggSpot(), '75', 'bluff', { rng: () => 0.8 });    // bf .62, bc .33 → call
    expect(called.botAction).toBe('call');
    expect(called.realized).toBeCloseTo(-9); // bet = 0.75 * 12
  });

  it('checking realizes nothing', () => {
    expect(resolveRealized(aggSpot(), 'check', 'bluff', { rng: () => 0 })).toMatchObject({ realized: 0 });
  });

  it('defender call beats a bluff and pays a value hand', () => {
    // q = (2.5 + 14.8) / (20 + 29.6) ≈ 0.349; rng 0 → bluff, rng .99 → value
    const vsBluff = resolveRealized(defCall(), 'call', 'bluffcatcher', { rng: () => 0 });
    expect(vsBluff).toMatchObject({ botHand: 'bluff' });
    expect(vsBluff.realized).toBeCloseTo(34.8); // pot 20 + bet 14.8
    const vsValue = resolveRealized(defCall(), 'call', 'bluffcatcher', { rng: () => 0.99 });
    expect(vsValue.botHand).toBe('value');
    expect(vsValue.realized).toBeCloseTo(-14.8);
    expect(resolveRealized(defCall(), 'fold', 'bluffcatcher', { rng: () => 0 }).realized).toBe(0);
  });
});

describe('showdown classification + stats split', () => {
  const aggSpot = () => buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');
  const defCall = () => buildSpotPool([aggDoc]).find(s => s.kind === 'defender' && s.sizeBucket === '75');

  it('flags showdown only when cards get compared', () => {
    // bluff that gets folded out → non-showdown; that gets called → showdown
    expect(resolveRealized(aggSpot(), '75', 'bluff', { rng: () => 0 }).showdown).toBe(false);
    expect(resolveRealized(aggSpot(), '75', 'bluff', { rng: () => 0.8 }).showdown).toBe(true);
    expect(resolveRealized(aggSpot(), 'check', 'bluff', { rng: () => 0 }).showdown).toBe(false);
    // defender: calling reaches showdown, folding does not
    expect(resolveRealized(defCall(), 'call', 'bluffcatcher', { rng: () => 0 }).showdown).toBe(true);
    expect(resolveRealized(defCall(), 'fold', 'bluffcatcher', { rng: () => 0 }).showdown).toBe(false);
  });

  it('reports the variance-removed expectation of the realized outcome', () => {
    // defender call: E[realized] == callEvBb by construction of the implied bluff freq
    expect(resolveRealized(defCall(), 'call', 'bluffcatcher', { rng: () => 0 }).evRealized).toBeCloseTo(2.5);
    expect(resolveRealized(defCall(), 'fold', 'bluffcatcher', { rng: () => 0 }).evRealized).toBe(0);
    // aggressor bluff 75 (pot 12, bet 9): bf*pot - (bc+br)*bet = .62*12 - .38*9 = 4.02
    expect(resolveRealized(aggSpot(), '75', 'bluff', { rng: () => 0 }).evRealized).toBeCloseTo(4.02);
    // value 75: (bc+br)*bet = .38*9 = 3.42
    expect(resolveRealized(aggSpot(), '75', 'value', { rng: () => 0 }).evRealized).toBeCloseTo(3.42);
    // the sampled realized is unbiased around it across the two outcomes:
    expect(resolveRealized(aggSpot(), 'check', 'bluff', { rng: () => 0 }).evRealized).toBe(0);
  });

  it('splits realized into showdown / non-showdown that sum to net', () => {
    let stats = emptyStats();
    stats = applyRep(stats, playRep(aggSpot(), '75', 'bluff', { rng: () => 0 }));   // fold → +12 non-showdown
    stats = applyRep(stats, playRep(defCall(), 'call', 'bluffcatcher', { rng: () => 0 })); // bluff → +34.8 showdown
    expect(stats.nonShowdown).toBeCloseTo(12);
    expect(stats.showdown).toBeCloseTo(34.8);
    expect(stats.showdown + stats.nonShowdown).toBeCloseTo(stats.realized);
  });
});

describe('non-numeric size buckets (e.g. "200+")', () => {
  // A spot whose best/only size is the overbet bucket "200+" — Number("200+") is
  // NaN, which used to poison realized/EV and blank every stat.
  const overbetDoc = {
    bucket: 'BB_vs_LP_srp_reg', perspective: 'ip',
    spots: [{
      line: 'B-B-B', street: 'river', label: 'Overbet river',
      sample_size: 5000, confidence: 'high', pot_bb: 10,
      per_size: { '200+': { label: 'Bet 200%+', bf: 0.7, bc: 0.25, br: 0.05, bluff_ev_bb_incremental: 3.0, value_ev_bb_incremental: 1.0 } },
      recommendation: { verb: 'bluff', best_size: '200+', best_ev_bb: 3.0, type: 'bluff' },
    }],
    defenses: [],
  };
  const spot = () => buildSpotPool([overbetDoc]).find(s => s.kind === 'aggressor');

  it('produces finite realized / EV for a 200%+ bet', () => {
    const r = playRep(spot(), '200+', 'bluff', { rng: () => 0 }); // bot folds
    expect(Number.isFinite(r.realized)).toBe(true);
    expect(Number.isFinite(r.evRealized)).toBe(true);
    expect(r.realized).toBe(10);            // steal the 10bb pot
    expect(r.evRealized).toBeCloseTo(0.7 * 10 - 0.3 * 20); // 7 - 6 = 1 (bet = 2x pot)
  });

  it('keeps session stats finite across a 200+ rep', () => {
    let stats = emptyStats();
    stats = applyRep(stats, playRep(spot(), '200+', 'bluff', { rng: () => 0.9 })); // bot calls
    expect(Number.isFinite(stats.realized)).toBe(true);
    expect(Number.isFinite(stats.evReal)).toBe(true);
    expect(Number.isFinite(stats.evEfficiency)).toBe(true);
  });
});

describe('playRep', () => {
  it('merges the EV verdict with the realized chip result', () => {
    const spot = buildSpotPool([aggDoc]).find(s => s.kind === 'aggressor');
    const r = playRep(spot, '75', 'bluff', { rng: () => 0 });
    expect(r.correct).toBe(true);       // 75 is EV-max for the bluff
    expect(r.repScore).toBe(100);
    expect(r.botAction).toBe('fold');   // ...but the realized roll
    expect(r.realized).toBe(12);
    expect(r.pickKey).toBe('75');
    expect(r.category).toBe('bluff');
  });
});

describe('runBatch (headless fast-forward)', () => {
  it('simulates N optimal hands with finite, foldable results', () => {
    const pool = buildSpotPool([aggDoc]);
    const results = runBatch(pool, 500, { optimal: true });
    expect(results).toHaveLength(500);
    expect(results.every(r => Number.isFinite(r.realized) && Number.isFinite(r.evRealized))).toBe(true);
    // optimal play never leaves EV on the table
    expect(results.every(r => r.correct)).toBe(true);
    const stats = results.reduce(applyRep, emptyStats());
    expect(stats.reps).toBe(500);
    expect(stats.accuracy).toBe(1);
    expect(Number.isFinite(stats.realized)).toBe(true);
    expect(Number.isFinite(stats.evReal)).toBe(true);
  });

  it('returns nothing for an empty pool', () => {
    expect(runBatch([], 100)).toEqual([]);
    expect(runBatch(null, 100)).toEqual([]);
  });
});

describe('pickRandomSpot', () => {
  it('honors injected rng and avoids the previous spot', () => {
    const pool = buildSpotPool([aggDoc]);
    expect(pickRandomSpot(pool, { rng: () => 0 })).toBe(pool[0]);

    const avoided = pool[0];
    const next = pickRandomSpot(pool, { rng: () => 0, avoid: avoided });
    expect(next).not.toBe(avoided); // index 0 of the filtered list is pool[1]
  });

  it('returns null on an empty pool', () => {
    expect(pickRandomSpot([], {})).toBeNull();
  });
});
