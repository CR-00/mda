import { describe, it, expect } from 'vitest';
import { ALL_LINES, ALL_LINES_FLAT } from '../lib/lines.js';

const VALID_SEGMENTS = new Set(['B','X','C','R','F','BF','BC','BR','XF','XC','XR','XRC','RC','XRF','RF','BRC','XRR']);
const TOTAL_EXPECTED = 207;

describe('ALL_LINES structure', () => {
  it('has flop, turn, and river keys', () => {
    expect(ALL_LINES).toHaveProperty('flop');
    expect(ALL_LINES).toHaveProperty('turn');
    expect(ALL_LINES).toHaveProperty('river');
  });

  it(`has ${TOTAL_EXPECTED} lines total`, () => {
    expect(ALL_LINES_FLAT).toHaveLength(TOTAL_EXPECTED);
  });

  it('all lines are non-empty strings', () => {
    for (const line of ALL_LINES_FLAT) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('all lines are unique', () => {
    expect(new Set(ALL_LINES_FLAT).size).toBe(ALL_LINES_FLAT.length);
  });
});

describe('flop lines', () => {
  it('have no dashes (single-street)', () => {
    for (const line of ALL_LINES.flop) {
      expect(line).not.toContain('-');
    }
  });

  it('each segment is a known snap token', () => {
    for (const line of ALL_LINES.flop) {
      expect(VALID_SEGMENTS.has(line), `unknown flop segment: ${line}`).toBe(true);
    }
  });
});

describe('turn lines', () => {
  it('have exactly one dash (two segments)', () => {
    for (const line of ALL_LINES.turn) {
      expect(line.split('-')).toHaveLength(2);
    }
  });

  it('each segment is a known snap token', () => {
    for (const line of ALL_LINES.turn) {
      for (const seg of line.split('-')) {
        expect(VALID_SEGMENTS.has(seg), `unknown turn segment: ${seg} in ${line}`).toBe(true);
      }
    }
  });
});

describe('river lines', () => {
  it('have exactly two dashes (three segments)', () => {
    for (const line of ALL_LINES.river) {
      expect(line.split('-')).toHaveLength(3);
    }
  });

  it('each segment is a known snap token', () => {
    for (const line of ALL_LINES.river) {
      for (const seg of line.split('-')) {
        expect(VALID_SEGMENTS.has(seg), `unknown river segment: ${seg} in ${line}`).toBe(true);
      }
    }
  });
});

describe('filename safety', () => {
  it('all lines produce filenames with only safe characters', () => {
    const SAFE = /^[A-Za-z0-9_\-.]+$/;
    for (const line of ALL_LINES_FLAT) {
      const filename = `BB_vs_LP_srp_reg_${line}.json`;
      expect(filename, `unsafe filename for line: ${line}`).toMatch(SAFE);
    }
  });
});
