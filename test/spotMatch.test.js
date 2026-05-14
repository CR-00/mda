import { describe, it, expect } from 'vitest';
import { deriveQueryLine, matchupToKey } from '../lib/spotMatch.js';

const acts = (...tuples) =>
  tuples.map(([street, actor, action]) => ({ street, actor, action, sizing: 0 }));

describe('matchupToKey', () => {
  it('builds correct key with perspective', () => {
    expect(matchupToKey('BB', 'LP', 'srp', 'reg', 'ip')).toBe('BB_vs_LP_srp_reg_ip');
    expect(matchupToKey('BB', 'LP', 'srp', 'reg', 'oop')).toBe('BB_vs_LP_srp_reg_oop');
    expect(matchupToKey('BB', 'LP', '3bp', 'fish', 'ip')).toBe('BB_vs_LP_3bp_fish_ip');
    expect(matchupToKey('SB', 'LP', '3bp', 'reg', 'oop')).toBe('SB_vs_LP_3bp_reg_oop');
  });

  it('defaults perspective to ip', () => {
    expect(matchupToKey('BB', 'LP', 'srp', 'reg')).toBe('BB_vs_LP_srp_reg_ip');
  });

  it('defaults playerType to reg', () => {
    expect(matchupToKey('BB', 'LP', 'srp')).toBe('BB_vs_LP_srp_reg_ip');
  });
});

describe('deriveQueryLine — IP perspective', () => {
  it('returns empty string when no actions', () => {
    expect(deriveQueryLine([], 'LP')).toBe('');
  });

  it('returns empty when only OOP has acted', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'bet']), 'LP')).toBe('');
  });

  // Single-letter codes (IP acts once per street)
  it('B — IP bets after OOP check', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet']), 'LP')).toBe('B');
  });

  it('X — both check', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'check'], ['flop', 'LP', 'check']), 'LP')).toBe('X');
  });

  it('C — OOP bets, IP calls', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'bet'], ['flop', 'LP', 'call']), 'LP')).toBe('C');
  });

  it('R — OOP bets, IP raises', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'bet'], ['flop', 'LP', 'raise']), 'LP')).toBe('R');
  });

  it('F — OOP bets, IP folds', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'bet'], ['flop', 'LP', 'fold']), 'LP')).toBe('F');
  });

  // Multi-action codes (IP acts twice on the street)
  it('BC — IP bets, OOP raises, IP calls', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'raise'], ['flop', 'LP', 'call']);
    expect(deriveQueryLine(line, 'LP')).toBe('BC');
  });

  it('BF — IP bets, OOP raises, IP folds', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'raise'], ['flop', 'LP', 'fold']);
    expect(deriveQueryLine(line, 'LP')).toBe('BF');
  });

  it('BR — IP bets, OOP raises, IP re-raises', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'raise'], ['flop', 'LP', 'raise']);
    expect(deriveQueryLine(line, 'LP')).toBe('BR');
  });

  // Multi-street
  it('B-B — IP bets flop and turn', () => {
    const line = acts(
      ['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call'],
      ['turn', 'BB', 'check'], ['turn', 'LP', 'bet'],
    );
    expect(deriveQueryLine(line, 'LP')).toBe('B-B');
  });

  it('B-B-B — IP bets all three streets', () => {
    const line = acts(
      ['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call'],
      ['turn', 'BB', 'check'], ['turn', 'LP', 'bet'], ['turn', 'BB', 'call'],
      ['river', 'BB', 'check'], ['river', 'LP', 'bet'],
    );
    expect(deriveQueryLine(line, 'LP')).toBe('B-B-B');
  });

  it('B-B-BF — IP bets all streets then folds to river raise', () => {
    const line = acts(
      ['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call'],
      ['turn', 'BB', 'check'], ['turn', 'LP', 'bet'], ['turn', 'BB', 'call'],
      ['river', 'BB', 'check'], ['river', 'LP', 'bet'], ['river', 'BB', 'raise'], ['river', 'LP', 'fold'],
    );
    expect(deriveQueryLine(line, 'LP')).toBe('B-B-BF');
  });
});

describe('deriveQueryLine — OOP perspective', () => {
  it('X — OOP checks (IP checks back)', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'check'], ['flop', 'LP', 'check']), 'BB')).toBe('X');
  });

  it('B — OOP leads (donk bet)', () => {
    expect(deriveQueryLine(acts(['flop', 'BB', 'bet'], ['flop', 'LP', 'call']), 'BB')).toBe('B');
  });

  it('XC — OOP checks then calls IP bet', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call']);
    expect(deriveQueryLine(line, 'BB')).toBe('XC');
  });

  it('XR — OOP check-raises', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'raise']);
    expect(deriveQueryLine(line, 'BB')).toBe('XR');
  });

  it('XF — OOP check-folds', () => {
    const line = acts(['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'fold']);
    expect(deriveQueryLine(line, 'BB')).toBe('XF');
  });

  it('XC-X — OOP check-calls flop, checks turn', () => {
    const line = acts(
      ['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call'],
      ['turn', 'BB', 'check'], ['turn', 'LP', 'check'],
    );
    expect(deriveQueryLine(line, 'BB')).toBe('XC-X');
  });

  it('XC-XC-XC — OOP check-calls all three streets', () => {
    const line = acts(
      ['flop', 'BB', 'check'], ['flop', 'LP', 'bet'], ['flop', 'BB', 'call'],
      ['turn', 'BB', 'check'], ['turn', 'LP', 'bet'], ['turn', 'BB', 'call'],
      ['river', 'BB', 'check'], ['river', 'LP', 'bet'], ['river', 'BB', 'call'],
    );
    expect(deriveQueryLine(line, 'BB')).toBe('XC-XC-XC');
  });
});
