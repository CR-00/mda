import { describe, it, expect } from 'vitest';
import { annotateAlpha } from '../scripts/build-strategy/alpha.mjs';

// Helpers — concise factories so each test reads like a scenario, not boilerplate.
const bet = (over) => ({
  type: 'overfold',
  perspective: 'ip',
  street: 'flop',
  line: 'B',
  sizing: '25',
  bluff_ev_bb: 5,
  ...over,
});

const facing = (over) => ({
  type: 'facing_call_+ev',
  perspective: 'oop',
  street: 'flop',
  line: 'B',
  sizing: '25',
  ev_bb: 2,
  ...over,
});

const run = (rows) => {
  const out = annotateAlpha(rows);
  return out;
};

describe('annotateAlpha — mutates in place and returns same array', () => {
  it('returns the input array reference', () => {
    const rows = [bet({})];
    const out = annotateAlpha(rows);
    expect(out).toBe(rows);
  });

  it('attaches `alpha` to every row', () => {
    const rows = [bet({}), facing({}), { type: 'multistreet', perspective: 'ip', ev_bb: 3 }];
    annotateAlpha(rows);
    for (const r of rows) {
      expect(r.alpha).toBeDefined();
      expect(typeof r.alpha.alpha_bb).toBe('number');
      expect(typeof r.alpha.kind).toBe('string');
    }
  });
});

describe('bet exploits — α = gross − max(0, mirror_call_ev)', () => {
  it('no mirror in feed → α equals gross (assumed durable)', () => {
    const rows = run([bet({ bluff_ev_bb: 7 })]);
    expect(rows[0].alpha.kind).toBe('bet');
    expect(rows[0].alpha.gross_ev_bb).toBe(7);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(null);
    expect(rows[0].alpha.alpha_bb).toBe(7);
  });

  it('mirror call_ev ≤ 0 → no discount (opponent has no profitable counter)', () => {
    const rows = run([
      bet({ bluff_ev_bb: 7 }),
      facing({ type: 'facing_call_-ev', ev_bb: -2 }),
    ]);
    const b = rows[0];
    expect(b.alpha.mirror_call_ev_bb).toBe(-2);
    expect(b.alpha.alpha_bb).toBe(7);
  });

  it('mirror call_ev > 0 → discount α by exactly that counter', () => {
    const rows = run([
      bet({ bluff_ev_bb: 10 }),
      facing({ ev_bb: 3 }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(3);
    expect(rows[0].alpha.alpha_bb).toBe(7);
  });

  it('mirror call_ev > gross → α negative (call side carries the alpha)', () => {
    const rows = run([
      bet({ bluff_ev_bb: 4 }),
      facing({ ev_bb: 6 }),
    ]);
    expect(rows[0].alpha.alpha_bb).toBe(-2);
  });

  it('applies uniformly to overfold / load_bluff_zone / no_bluff_zone', () => {
    const rows = run([
      bet({ type: 'overfold', bluff_ev_bb: 5 }),
      bet({ type: 'load_bluff_zone', bluff_ev_bb: 5, sizing: '50' }),
      bet({ type: 'no_bluff_zone', value_ev_bb: 5, bluff_ev_bb: undefined, sizing: '75' }),
      facing({ ev_bb: 2, sizing: '25' }),
      facing({ ev_bb: 2, sizing: '50' }),
      facing({ ev_bb: 2, sizing: '75' }),
    ]);
    expect(rows[0].alpha.alpha_bb).toBe(3);
    expect(rows[1].alpha.alpha_bb).toBe(3);
    expect(rows[2].alpha.alpha_bb).toBe(3);
    expect(rows[0].alpha.kind).toBe('bet');
    expect(rows[1].alpha.kind).toBe('bet');
    expect(rows[2].alpha.kind).toBe('bet');
  });

  it('reads EV from ev_bb / bluff_ev_bb / value_ev_bb in that priority', () => {
    const rows = run([
      { ...bet({}), ev_bb: 1, bluff_ev_bb: 99, value_ev_bb: 99 }, // ev_bb wins
      { ...bet({ sizing: '50' }), bluff_ev_bb: 2, value_ev_bb: 99 }, // bluff_ev_bb wins
      { ...bet({ sizing: '75' }), value_ev_bb: 3, bluff_ev_bb: undefined }, // value_ev_bb wins
    ]);
    expect(rows[0].alpha.gross_ev_bb).toBe(1);
    expect(rows[1].alpha.gross_ev_bb).toBe(2);
    expect(rows[2].alpha.gross_ev_bb).toBe(3);
  });
});

describe('facing_call_+ev — pure counter / pure alpha', () => {
  it('α equals gross EV (the call IS the counter)', () => {
    const rows = run([facing({ ev_bb: 8.71 })]);
    expect(rows[0].alpha.kind).toBe('counter');
    expect(rows[0].alpha.alpha_bb).toBe(8.71);
    expect(rows[0].alpha.gross_ev_bb).toBe(8.71);
  });

  it('does not get discounted by anything (no symmetric counter)', () => {
    const rows = run([
      facing({ ev_bb: 5 }),
      bet({ bluff_ev_bb: 10 }), // bet on the *same* node from the opposite side; should not discount the call
    ]);
    expect(rows[0].alpha.alpha_bb).toBe(5);
  });
});

describe('facing_call_-ev — folding is correct, α = 0', () => {
  it('α is zero regardless of how negative the call EV is', () => {
    const rows = run([facing({ type: 'facing_call_-ev', ev_bb: -42.18 })]);
    expect(rows[0].alpha.kind).toBe('fold');
    expect(rows[0].alpha.alpha_bb).toBe(0);
    expect(rows[0].alpha.gross_ev_bb).toBe(-42.18);
  });
});

describe('multistreet — α = gross (no per-street counter discount)', () => {
  it('kind is multistreet and α equals gross', () => {
    const rows = run([{
      type: 'multistreet', perspective: 'ip',
      street: 'flop', line: 'B', sizing_chain: '25/25/50',
      ev_bb: 5.49,
    }]);
    expect(rows[0].alpha.kind).toBe('multistreet');
    expect(rows[0].alpha.alpha_bb).toBe(5.49);
  });
});

describe('mirror pairing — keys on (street, line, sizing, opposite perspective)', () => {
  it('matches ip-bet ↔ oop-facing at same (street, line, sizing)', () => {
    const rows = run([
      bet({ perspective: 'ip', street: 'river', line: 'B-B-B', sizing: '100', bluff_ev_bb: 8.88 }),
      facing({ perspective: 'oop', street: 'river', line: 'B-B-B', sizing: '100', ev_bb: 6.06 }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(6.06);
  });

  it('matches oop-bet ↔ ip-facing (opposite direction)', () => {
    const rows = run([
      bet({ perspective: 'oop', street: 'turn', line: 'X-B', sizing: '50', bluff_ev_bb: 4 }),
      facing({ perspective: 'ip', street: 'turn', line: 'X-B', sizing: '50', ev_bb: 1.5 }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(1.5);
  });

  it('does NOT match when sizing differs', () => {
    const rows = run([
      bet({ bluff_ev_bb: 5, sizing: '25' }),
      facing({ ev_bb: 3, sizing: '50' }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(null);
    expect(rows[0].alpha.alpha_bb).toBe(5);
  });

  it('does NOT match when street differs', () => {
    const rows = run([
      bet({ bluff_ev_bb: 5, street: 'flop' }),
      facing({ ev_bb: 3, street: 'turn' }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(null);
  });

  it('does NOT match when line differs', () => {
    const rows = run([
      bet({ bluff_ev_bb: 5, line: 'B' }),
      facing({ ev_bb: 3, line: 'X-B' }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(null);
  });

  it('does NOT match same-perspective facing (no self-mirror)', () => {
    const rows = run([
      bet({ perspective: 'ip', bluff_ev_bb: 5 }),
      facing({ perspective: 'ip', ev_bb: 3 }), // same side — must not pair
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(null);
  });

  it('uses facing_call_-ev rows as mirrors too (carrying their negative ev_bb)', () => {
    const rows = run([
      bet({ bluff_ev_bb: 5 }),
      facing({ type: 'facing_call_-ev', ev_bb: -1.5 }),
    ]);
    expect(rows[0].alpha.mirror_call_ev_bb).toBe(-1.5);
    expect(rows[0].alpha.alpha_bb).toBe(5); // no discount, but mirror value preserved
  });
});

describe('regression — canonical examples from BB_vs_LP_srp_reg', () => {
  // These mirror the live-data spot-checks from when the metric was specced.
  // If any of these flip, the mirror pairing or discount math regressed.
  const canonical = [
    { ip: 'ip',  line: 'B-B-B',  sizing: '75',  bluff_ev_bb: 10.15, mirror: 1.51,  expectedAlpha: 8.64 },
    { ip: 'ip',  line: 'B-B-B',  sizing: '100', bluff_ev_bb: 8.88,  mirror: 6.06,  expectedAlpha: 2.82 },
    { ip: 'ip',  line: 'B-B-B',  sizing: '33',  bluff_ev_bb: 5.10,  mirror: -2.11, expectedAlpha: 5.10 },
    { ip: 'oop', line: 'XC-X-B', sizing: '25',  bluff_ev_bb: 4.63,  mirror: -1.05, expectedAlpha: 4.63 },
    { ip: 'oop', line: 'XC-X-B', sizing: '100', bluff_ev_bb: 3.62,  mirror: 1.32,  expectedAlpha: 2.30 },
    // The signature case: bet gross is positive but the counter is bigger → α negative.
    { ip: 'oop', line: 'X-B-B',  sizing: '100', bluff_ev_bb: 5.58,  mirror: 5.73,  expectedAlpha: -0.15 },
  ];

  for (const c of canonical) {
    it(`${c.ip} ${c.line} ${c.sizing}%  α=${c.expectedAlpha}`, () => {
      const rows = run([
        bet({ perspective: c.ip, line: c.line, sizing: c.sizing, bluff_ev_bb: c.bluff_ev_bb, street: 'river' }),
        facing({ perspective: c.ip === 'ip' ? 'oop' : 'ip', line: c.line, sizing: c.sizing, ev_bb: c.mirror, street: 'river' }),
      ]);
      expect(rows[0].alpha.alpha_bb).toBeCloseTo(c.expectedAlpha, 2);
    });
  }

  it('B-B-B 150% — α concentrates on the BB calling side (+8.71), bet side decays', () => {
    const rows = run([
      bet({ perspective: 'ip', line: 'B-B-B', sizing: '150', bluff_ev_bb: 2.92, street: 'river' }),
      facing({ perspective: 'oop', line: 'B-B-B', sizing: '150', ev_bb: 8.71, street: 'river' }),
    ]);
    const betRow = rows[0];
    const callRow = rows[1];
    expect(callRow.alpha.kind).toBe('counter');
    expect(callRow.alpha.alpha_bb).toBeCloseTo(8.71, 2);
    expect(betRow.alpha.alpha_bb).toBeCloseTo(-5.79, 2); // deeply negative — pure beta trap
    expect(callRow.alpha.alpha_bb).toBeGreaterThan(betRow.alpha.alpha_bb);
  });
});
