import { describe, it, expect } from 'vitest';
import { toRows, normalizeSnapBody } from '../lib/snapFormat.js';

describe('toRows', () => {
  it('converts columnar tables to row objects', () => {
    const table = {
      n: 2,
      cols: {
        metric: ['Overall', 'Archetype'],
        hits: [10, 20],
        nextActions: [{ BC: 1 }, { BF: 2 }],
      },
    };
    expect(toRows(table)).toEqual([
      { metric: 'Overall', hits: 10, nextActions: { BC: 1 } },
      { metric: 'Archetype', hits: 20, nextActions: { BF: 2 } },
    ]);
  });

  it('passes legacy row arrays through unchanged', () => {
    const rows = [{ metric: 'Overall' }];
    expect(toRows(rows)).toBe(rows);
  });
});

describe('normalizeSnapBody', () => {
  it('converts data and compareData, keeps other keys', () => {
    const body = {
      data: { n: 1, cols: { metric: ['Overall'] } },
      compareData: { n: 1, cols: { metric: ['Line'] } },
      query: { line: 'B' },
    };
    expect(normalizeSnapBody(body)).toEqual({
      data: [{ metric: 'Overall' }],
      compareData: [{ metric: 'Line' }],
      query: { line: 'B' },
    });
  });
});
