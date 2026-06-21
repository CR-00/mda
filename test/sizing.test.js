import { describe, it, expect } from 'vitest';
import { sizeToken, inferSizeSequence, inferSizeSeqPattern, prospectiveBetStreet, matchesSizeSeq, patternLabel } from '../lib/sizing.js';

describe('sizeToken — snapmda bucket boundaries', () => {
  it('maps % of pot to S/M/L/OB', () => {
    expect(sizeToken(25)).toBe('S');
    expect(sizeToken(33)).toBe('S');
    expect(sizeToken(50)).toBe('M');
    expect(sizeToken(66)).toBe('M');
    expect(sizeToken(75)).toBe('L');
    expect(sizeToken(100)).toBe('L');
    expect(sizeToken(125)).toBe('OB');
    expect(sizeToken(200)).toBe('OB');
  });

  it('treats bucket edges as the start of the next bucket', () => {
    expect(sizeToken(45)).toBe('M');
    expect(sizeToken(70)).toBe('L');
    expect(sizeToken(105)).toBe('OB');
  });

  it('returns null when no size is picked', () => {
    expect(sizeToken(0)).toBeNull();
    expect(sizeToken(null)).toBeNull();
    expect(sizeToken(undefined)).toBeNull();
  });
});

const bet = (street, sizing = 0) => ({ street, action: 'bet', sizing });
const node = (street, action) => ({ street, action, sizing: 0 });

describe('inferSizeSequence', () => {
  it('returns null when the line has no bet', () => {
    expect(inferSizeSequence([node('flop', 'check'), node('flop', 'check')])).toBeNull();
    expect(inferSizeSequence([])).toBeNull();
    expect(inferSizeSequence(null)).toBeNull();
  });

  it('uses the first bet of each street', () => {
    expect(inferSizeSequence([bet('flop', 33)])).toBe('S');
    expect(inferSizeSequence([
      bet('flop', 33), node('flop', 'call'),
      bet('turn', 75),
    ])).toBe('S-L');
  });

  it('classifies a checked-through street as X', () => {
    expect(inferSizeSequence([
      node('flop', 'check'), node('flop', 'check'),
      bet('turn', 125),
    ])).toBe('X-OB');
  });

  it('shows ? for a bet whose size is not yet picked', () => {
    expect(inferSizeSequence([bet('flop', 0)])).toBe('?');
    expect(inferSizeSequence([
      bet('flop', 50), node('flop', 'call'),
      bet('turn', 0),
    ])).toBe('M-?');
  });

  it('ignores trailing streets that have no bet', () => {
    expect(inferSizeSequence([
      bet('flop', 75), node('flop', 'call'),
      node('turn', 'check'),
    ])).toBe('L');
  });

  it('ignores markers and only counts the first bet, not raises', () => {
    expect(inferSizeSequence([
      { street: 'flop', action: '_street_start', marker: true, sizing: 0 },
      bet('flop', 50), { street: 'flop', action: 'raise', sizing: 200 },
    ])).toBe('M');
  });
});

describe('inferSizeSeqPattern', () => {
  it('returns null when there is no bet', () => {
    expect(inferSizeSeqPattern([node('flop', 'check')])).toBeNull();
  });

  it('uses null (wildcard) for bets without a picked size', () => {
    expect(inferSizeSeqPattern([
      bet('flop', 75), node('flop', 'call'),
      bet('turn', 0),
    ])).toEqual(['L', null]);
  });

  it('keeps X for checked-through streets', () => {
    expect(inferSizeSeqPattern([
      node('flop', 'check'), node('flop', 'check'),
      bet('turn', 125),
    ])).toEqual(['X', 'OB']);
  });
});

describe('prospectiveBetStreet', () => {
  it('is flop at the root', () => {
    expect(prospectiveBetStreet([])).toBe('flop');
  });
  it('advances to the next street after a call', () => {
    expect(prospectiveBetStreet([
      bet('flop', 33), node('flop', 'call'),
      bet('turn', 66), node('turn', 'call'),
    ])).toBe('river');
  });
  it('advances after a check-through', () => {
    expect(prospectiveBetStreet([node('flop', 'check'), node('flop', 'check')])).toBe('turn');
  });
  it('stays on the same street after a single (opponent) check', () => {
    expect(prospectiveBetStreet([node('flop', 'check')])).toBe('flop');
  });
});

describe('inferSizeSeqPattern with a prospective bet', () => {
  it('appends a wildcard for the bet being chosen (S-M → S-M-*)', () => {
    const line = [
      bet('flop', 33), node('flop', 'call'),
      bet('turn', 66), node('turn', 'call'),
    ];
    expect(inferSizeSeqPattern(line, 'river')).toEqual(['S', 'M', null]);
    expect(patternLabel(inferSizeSeqPattern(line, 'river'))).toBe('S-M-*');
  });
  it('fills checked-through streets before the prospective bet with X', () => {
    const line = [
      bet('flop', 33), node('flop', 'call'),
      node('turn', 'check'), node('turn', 'check'),
    ];
    expect(inferSizeSeqPattern(line, 'river')).toEqual(['S', 'X', null]);
  });
});

describe('matchesSizeSeq', () => {
  it('matches everything when pattern is null', () => {
    expect(matchesSizeSeq('S-L-OB', null)).toBe(true);
  });

  it('requires equal length', () => {
    expect(matchesSizeSeq('L-L', ['L', 'L', 'L'])).toBe(false);
  });

  it('treats null entries as wildcards', () => {
    expect(matchesSizeSeq('L-S-OB', ['L', null, null])).toBe(true);
    expect(matchesSizeSeq('M-S-OB', ['L', null, null])).toBe(false);
    expect(matchesSizeSeq('L-S-OB', ['L', null, 'OB'])).toBe(true);
    expect(matchesSizeSeq('L-S-L', ['L', null, 'OB'])).toBe(false);
  });

  it('renders wildcards as * in the label', () => {
    expect(patternLabel(['L', null, null])).toBe('L-*-*');
    expect(patternLabel(null)).toBe('');
  });
});
