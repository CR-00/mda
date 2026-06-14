import { describe, it, expect } from 'vitest';
import { adaptOverall } from '../pages/api/scan.js';

const overall = (overrides = {}) => ({
  metric: 'Overall',
  value: 'Average',
  action: 'B',
  hits: 200,
  opps: 400,
  freq: 0.5,
  pctPot: 0.5,
  pot: 10,
  nextActions: { BF: 120, BC: 60, BR: 20 },
  ...overrides,
});

describe('adaptOverall', () => {
  it('returns null when no Overall row present', () => {
    expect(adaptOverall([{ metric: 'Size', value: '33%', action: 'B' }])).toBeNull();
  });

  it('returns null on empty array', () => {
    expect(adaptOverall([])).toBeNull();
  });

  it('uses bluffVevPct (already 0..1) and scales to a percentage', () => {
    // bluffVevPct = 0.05 means +5% EV.
    const r = adaptOverall([overall({ bluffVevPct: 0.05 })]);
    expect(r.bluffEV).toBeCloseTo(5);
  });

  it('falls back to (BF - BC*sizeRatio)*100 when bluffVevPct is missing', () => {
    // Normalized: bf=0.6, bc=0.3, br=0.1. sizeRatio=0.5.
    // (0.6 - 0.3*0.5)*100 = 45
    const r = adaptOverall([overall()]);
    expect(r.bluffEV).toBeCloseTo(45);
  });

  it('uses catchVevPct * 100 for callEV', () => {
    const r = adaptOverall([overall({ catchVevPct: 0.07 })]);
    expect(r.callEV).toBeCloseTo(7);
  });

  it('defaults callEV to 0 when catchVevPct missing', () => {
    expect(adaptOverall([overall()]).callEV).toBe(0);
  });

  it('normalizes next actions to fractions summing to 1', () => {
    const r = adaptOverall([overall({ nextActions: { BF: 60, BC: 30, BR: 10 } })]);
    expect(r.next.bf).toBeCloseTo(0.6);
    expect(r.next.bc).toBeCloseTo(0.3);
    expect(r.next.br).toBeCloseTo(0.1);
    expect(r.next.bf + r.next.bc + r.next.br).toBeCloseTo(1);
  });

  it('sets hasBR=true when br fraction exceeds 0.01', () => {
    const r = adaptOverall([overall({ nextActions: { BF: 60, BC: 30, BR: 10 } })]);
    expect(r.next.hasBR).toBe(true);
  });

  it('sets hasBR=false when br is below 1%', () => {
    const r = adaptOverall([overall({ nextActions: { BF: 60, BC: 39.5, BR: 0.5 } })]);
    expect(r.next.hasBR).toBe(false);
  });

  it('maps hits to sample, pot to potSize, pctPot to sizeRatio', () => {
    const r = adaptOverall([overall({ hits: 137, pot: 22, pctPot: 0.75 })]);
    expect(r.sample).toBe(137);
    expect(r.potSize).toBe(22);
    expect(r.sizeRatio).toBe(0.75);
  });

  it('handles missing nextActions without throwing (zero fractions)', () => {
    const r = adaptOverall([overall({ nextActions: undefined })]);
    expect(r.next.bf).toBe(0);
    expect(r.next.bc).toBe(0);
    expect(r.next.br).toBe(0);
  });

  it('ignores non-Overall rows when picking the Overall', () => {
    const rows = [
      { metric: 'Size', value: '33%', action: 'B', hits: 50, opps: 100, pctPot: 0.33, pot: 10, nextActions: { BF: 50, BC: 0, BR: 0 } },
      overall({ hits: 200 }),
      { metric: 'Texture', value: 'High card', action: 'B', hits: 80, opps: 130, pctPot: 0.6, pot: 10 },
    ];
    expect(adaptOverall(rows).sample).toBe(200);
  });
});
