import { describe, it, expect } from 'vitest';
import { classifyLine, ALL_LINES, ALL_LINES_FLAT } from '../lib/lines.js';

describe('classifyLine', () => {
  it('returns null for any line ending in F (fold, terminal)', () => {
    for (const line of ALL_LINES_FLAT) {
      if (line.endsWith('F')) {
        expect(classifyLine(line), `${line} should be null`).toBeNull();
      }
    }
  });

  it('all flop lines (no dashes) classify to flop street', () => {
    for (const line of ALL_LINES.flop) {
      const c = classifyLine(line);
      if (line.endsWith('F')) continue;
      expect(c?.street, `${line} -> ${c?.street}`).toBe('flop');
    }
  });

  it('all turn lines (one dash) classify to turn street', () => {
    for (const line of ALL_LINES.turn) {
      const c = classifyLine(line);
      if (line.endsWith('F')) continue;
      expect(c?.street, `${line} -> ${c?.street}`).toBe('turn');
    }
  });

  it('all river lines (two dashes) classify to river street', () => {
    for (const line of ALL_LINES.river) {
      const c = classifyLine(line);
      if (line.endsWith('F')) continue;
      expect(c?.street, `${line} -> ${c?.street}`).toBe('river');
    }
  });

  it('lines ending in B or R are "facing" (hero facing aggression)', () => {
    expect(classifyLine('B').mode).toBe('facing');
    expect(classifyLine('XR').mode).toBe('facing');
    expect(classifyLine('B-B').mode).toBe('facing');
    expect(classifyLine('XC-X-B').mode).toBe('facing');
    expect(classifyLine('B-B-XR').mode).toBe('facing');
  });

  it('lines ending in C or X are "bet" (hero gets to act first)', () => {
    expect(classifyLine('X').mode).toBe('bet');
    expect(classifyLine('XC').mode).toBe('bet');
    expect(classifyLine('XC-X').mode).toBe('bet');
    expect(classifyLine('XC-XC-X').mode).toBe('bet');
    expect(classifyLine('BC-BC-XC').mode).toBe('bet');
  });

  it('compound segments still classify by final character of last segment', () => {
    expect(classifyLine('XRC')).toEqual({ street: 'flop', mode: 'bet' });
    expect(classifyLine('BRC')).toEqual({ street: 'flop', mode: 'bet' });
    expect(classifyLine('B-XR')).toEqual({ street: 'turn', mode: 'facing' });
    expect(classifyLine('B-BC-X')).toEqual({ street: 'river', mode: 'bet' });
  });

  it('every non-fold line in ALL_LINES_FLAT classifies to a defined street + mode', () => {
    const nonFold = ALL_LINES_FLAT.filter(l => !l.endsWith('F'));
    for (const line of nonFold) {
      const c = classifyLine(line);
      expect(c, `no classification for ${line}`).not.toBeNull();
      expect(['flop', 'turn', 'river']).toContain(c.street);
      expect(['bet', 'facing']).toContain(c.mode);
    }
  });
});
