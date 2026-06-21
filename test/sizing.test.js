import { describe, it, expect } from 'vitest';
import { sizeToken, inferSizeSequence } from '../lib/sizing.js';

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
