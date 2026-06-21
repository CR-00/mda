import { describe, it, expect } from 'vitest';
import { adaptTableData, computeBoardAdjusted, applySizeSignals, SIZE_SEQ_PRIOR } from '../lib/adaptData.js';

const row = (overrides = {}) => ({
  metric: 'Overall',
  value: 'Average',
  action: 'B',
  hits: 100,
  opps: 200,
  freq: 0.5,
  pctPot: 0.5,
  pot: 22,
  nextActions: { BF: 60, BC: 30, BR: 10 },
  ...overrides,
});

describe('adaptTableData', () => {
  it('returns null when Overall row is absent', () => {
    expect(adaptTableData([row({ metric: 'Texture', value: 'High card' })], 'Texture')).toBeNull();
  });

  it('extracts overall row', () => {
    const result = adaptTableData([row()], 'Texture');
    expect(result).not.toBeNull();
    expect(result.overall.label).toBe('Average');
    expect(result.rows).toHaveLength(0);
  });

  it('extracts matching metric rows', () => {
    const rows = [
      row(),
      row({ metric: 'Texture', value: 'High card' }),
      row({ metric: 'Texture', value: 'Low card' }),
      row({ metric: 'Size', value: 'Small' }),
    ];
    const result = adaptTableData(rows, 'Texture');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(r => r.label)).toEqual(['High card', 'Low card']);
  });

  it('normalizes nextActions to fractions summing to 1', () => {
    const result = adaptTableData([row({ nextActions: { BF: 6, BC: 3, BR: 1 } })], 'Texture');
    const { bf, bc, br } = result.overall.next;
    expect(bf).toBeCloseTo(0.6);
    expect(bc).toBeCloseTo(0.3);
    expect(br).toBeCloseTo(0.1);
    expect(bf + bc + br).toBeCloseTo(1);
  });

  it('handles missing nextActions without throwing', () => {
    const result = adaptTableData([row({ nextActions: undefined })], 'Texture');
    expect(result.overall.next).toBeDefined();
  });

  // Real snap export shape: nextActions includes both the 2-char response keys
  // (BF/BC/BR — what we want) AND compound 3+-char keys like 'B-F', 'B-X' that
  // track "the response followed by villain's next-street action". normalizeNext
  // must filter to length-2 keys before suffix-matching — otherwise it grabs
  // 'B-F' as fold, 'B-C' as call, 'B-B' as raise and produces wildly wrong
  // fold/call/raise frequencies (the 5/2/93 bug reported on chips='bcx').
  it('ignores compound nextActions keys (B-F, B-X, …) and uses only BF/BC/BR', () => {
    const realRow = {
      metric: 'Overall', value: 'Average', action: 'B',
      hits: 21721, opps: 49062, freq: 0.44, pctPot: 0.66, pot: 9.69,
      nextActions: {
        'B-B': 4383, 'B-C': 97, 'B-F': 206, 'B-R': 65, 'B-X': 4094,
        BC: 395, BF: 646, BR: 55,
      },
    };
    const result = adaptTableData([realRow], 'Texture');
    // Total of the 2-char keys is 646+395+55 = 1096 → 59% / 36% / 5%
    expect(result.overall.next.bf).toBeCloseTo(646 / 1096, 3);
    expect(result.overall.next.bc).toBeCloseTo(395 / 1096, 3);
    expect(result.overall.next.br).toBeCloseTo(55 / 1096, 3);
    // The compound 'B-B' key (4383) must NOT dominate the raise share.
    expect(result.overall.next.br).toBeLessThan(0.10);
  });

  it('maps hits/opps to sample/ofN', () => {
    const result = adaptTableData([row({ hits: 123, opps: 456 })], 'Texture');
    expect(result.overall.sample).toBe(123);
    expect(result.overall.ofN).toBe(456);
  });

  it('maps pctPot to avgSize as percentage', () => {
    const result = adaptTableData([row({ pctPot: 0.75 })], 'Texture');
    expect(result.overall.avgSize).toBeCloseTo(75);
  });
});

describe('computeBoardAdjusted', () => {
  const baseOverall = {
    freq: 0.5, bluffPct: 0.3, bluffEV: 10, avgSize: 50,
    potSize: 22, callEV: 5, sizeRatio: 0.5,
    next: { bf: 0.6, bc: 0.3, br: 0.1, hasBR: true },
    sample: 100, ofN: 200, label: 'Overall',
  };

  it('returns same object when no matching rows', () => {
    expect(computeBoardAdjusted(baseOverall, [])).toBe(baseOverall);
    expect(computeBoardAdjusted(baseOverall, null)).toBe(baseOverall);
  });

  it('sets label to "This board"', () => {
    const texRow = { ...baseOverall, label: 'High card', sample: 80, ofN: 150 };
    const result = computeBoardAdjusted(baseOverall, [texRow]);
    expect(result.label).toBe('This board');
  });

  it('adjusts freq upward when texture row has higher freq', () => {
    const texRow = { ...baseOverall, freq: 0.7, sample: 80, ofN: 150 };
    const result = computeBoardAdjusted(baseOverall, [texRow]);
    expect(result.freq).toBeGreaterThan(baseOverall.freq);
    expect(result.freq).toBeLessThanOrEqual(texRow.freq);
  });

  it('keeps next proportions summing to 1 after adjustment', () => {
    const texRow = { ...baseOverall, next: { bf: 0.8, bc: 0.15, br: 0.05, hasBR: true }, sample: 80, ofN: 150 };
    const result = computeBoardAdjusted(baseOverall, [texRow]);
    const total = result.next.bf + result.next.bc + result.next.br;
    expect(total).toBeCloseTo(1);
  });

  it('sample is minimum across texture rows', () => {
    const rows = [
      { ...baseOverall, sample: 50, ofN: 100 },
      { ...baseOverall, sample: 30, ofN: 80 },
    ];
    const result = computeBoardAdjusted(baseOverall, rows);
    expect(result.sample).toBe(30);
    expect(result.ofN).toBe(80);
  });
});

describe('applySizeSignals', () => {
  const overall = {
    freq: 0.5, bluffPct: 0.3, bluffEV: 10, avgSize: 50,
    potSize: 22, callEV: 5, sizeRatio: 0.5,
    next: { bf: 0.6, bc: 0.3, br: 0.1, hasBR: true },
    sample: 1000, ofN: 2000, label: 'This board',
  };
  const lvl = (overrides) => ({ ...overall, sample: 500, ...overrides });
  // A sizing path that folds more often than the baseline.
  const seqRow = lvl({ next: { bf: 0.8, bc: 0.2, br: 0, hasBR: false }, callEV: 1 });

  it('no-ops (weight 0) when there are no signals', () => {
    expect(applySizeSignals(overall, overall, [])).toEqual({ row: overall, weight: 0, signals: [] });
    expect(applySizeSignals(overall, overall, [null, undefined])).toEqual({ row: overall, weight: 0, signals: [] });
  });

  it('uses the n/(n+prior) shrinkage weight for a single signal', () => {
    const { weight, signals } = applySizeSignals(overall, overall, [{ kind: 'path', row: seqRow, sample: 500 }]);
    expect(weight).toBeCloseTo(500 / (500 + SIZE_SEQ_PRIOR)); // 0.5 at n == prior
    expect(signals).toHaveLength(1);
  });

  it('nudges toward the signal but never past it, scaled by weight', () => {
    const { row } = applySizeSignals(overall, overall, [{ kind: 'path', row: seqRow, sample: 500 }]);
    expect(row.next.bf).toBeGreaterThan(overall.next.bf);
    expect(row.next.bf).toBeLessThan(seqRow.next.bf);
    expect(row.callEV).toBeGreaterThan(seqRow.callEV);
    expect(row.callEV).toBeLessThan(overall.callEV);
  });

  it('keeps the response mix summing to 1', () => {
    const { row } = applySizeSignals(overall, overall, [{ kind: 'path', row: seqRow, sample: 500 }]);
    expect(row.next.bf + row.next.bc + row.next.br).toBeCloseTo(1);
  });

  it('a tiny-sample signal barely moves the baseline', () => {
    const { row, weight } = applySizeSignals(overall, overall, [{ kind: 'path', row: seqRow, sample: 10 }]);
    expect(weight).toBeLessThan(0.02);
    expect(row.next.bf).toBeCloseTo(overall.next.bf, 2);
  });

  it('measures each level against its parent, not the baseline (no double count)', () => {
    // size row folds a lot (0.8); path row equals the size row → path adds nothing.
    const sizeRow = lvl({ next: { bf: 0.8, bc: 0.2, br: 0, hasBR: false }, sample: 9000 });
    const pathEqualsSize = lvl({ next: { bf: 0.8, bc: 0.2, br: 0, hasBR: false }, sample: 500 });
    const sizeOnly = applySizeSignals(overall, overall, [{ kind: 'size', row: sizeRow, sample: 9000 }]);
    const both = applySizeSignals(overall, overall, [
      { kind: 'size', row: sizeRow, sample: 9000 },
      { kind: 'path', row: pathEqualsSize, sample: 500 },
    ]);
    expect(both.row.next.bf).toBeCloseTo(sizeOnly.row.next.bf, 6);
  });

  it('path can pull back a high-sample size signal (the line motivating this)', () => {
    // size 75% folds 0.73 (huge sample); path L-L-L folds 0.60 (smaller).
    const sizeRow = lvl({ next: { bf: 0.73, bc: 0.25, br: 0.02, hasBR: true }, sample: 8546 });
    const pathRow = lvl({ next: { bf: 0.60, bc: 0.40, br: 0, hasBR: false }, sample: 575 });
    const sizeOnly = applySizeSignals(overall, overall, [{ kind: 'size', row: sizeRow, sample: 8546 }]);
    const both = applySizeSignals(overall, overall, [
      { kind: 'size', row: sizeRow, sample: 8546 },
      { kind: 'path', row: pathRow, sample: 575 },
    ]);
    // size alone pushes fold up; adding the path pulls it back down.
    expect(sizeOnly.row.next.bf).toBeGreaterThan(overall.next.bf);
    expect(both.row.next.bf).toBeLessThan(sizeOnly.row.next.bf);
  });

  it('layers onto the board-adjusted row and reports the strongest weight', () => {
    const boardAdjusted = { ...overall, next: { bf: 0.7, bc: 0.25, br: 0.05, hasBR: true } };
    const { row, weight } = applySizeSignals(boardAdjusted, overall, [
      { kind: 'size', row: lvl({ sample: 9000 }), sample: 9000 },
      { kind: 'path', row: seqRow, sample: 500 },
    ]);
    expect(weight).toBeCloseTo(9000 / (9000 + SIZE_SEQ_PRIOR));
    expect(row.next.bf).toBeGreaterThan(boardAdjusted.next.bf);
  });
});
