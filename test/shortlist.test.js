import { describe, it, expect } from 'vitest';
import { roleForDataKey, shortlistFor, isShortlisted } from '../lib/shortlist.js';
import { uploadDataKey } from '../lib/uploadKey.js';
import { ALL_LINES, isRiverLine } from '../lib/lines.js';

describe('roleForDataKey', () => {
  it('maps IP-raiser matchups', () => {
    expect(roleForDataKey('BB_vs_LP_srp_reg_ip')).toBe('ipPfr');
    expect(roleForDataKey('BB_vs_LP_srp_reg_oop')).toBe('oopPfc');
    expect(roleForDataKey('SB_vs_BB_3bp_reg_ip')).toBe('ipPfr');
    expect(roleForDataKey('LP_vs_LP_3bp_fish_oop')).toBe('oopPfc');
  });
  it('maps OOP-raiser matchups', () => {
    expect(roleForDataKey('SB_vs_BB_srp_reg_oop')).toBe('oopPfr');
    expect(roleForDataKey('SB_vs_BB_srp_fish_ip')).toBe('ipPfc');
    expect(roleForDataKey('Blinds_vs_LP_3bp_reg_oop')).toBe('oopPfr');
    expect(roleForDataKey('Blinds_vs_EP_3bp_reg_ip')).toBe('ipPfc');
  });
  it('rejects unrecognised keys', () => {
    expect(roleForDataKey('nonsense')).toBeNull();
    expect(roleForDataKey(undefined)).toBeNull();
    expect(shortlistFor('nonsense')).toEqual([]);
  });
});

describe('shortlist contents', () => {
  const keys = ['BB_vs_LP_srp_reg_ip', 'BB_vs_LP_srp_reg_oop', 'SB_vs_BB_srp_reg_ip', 'SB_vs_BB_srp_reg_oop'];
  const known = new Set(ALL_LINES.river);
  it('only lists known river lines, without duplicates', () => {
    for (const k of keys) {
      const lines = shortlistFor(k);
      expect(new Set(lines).size).toBe(lines.length);
      for (const l of lines) {
        expect(isRiverLine(l)).toBe(true);
        expect(known.has(l)).toBe(true);
      }
    }
  });
  it('has the expected sizes', () => {
    expect(keys.map(k => shortlistFor(k).length)).toEqual([13, 13, 20, 20]);
  });
  it('leaves out river lines ending in a check or call', () => {
    for (const k of keys) {
      for (const l of shortlistFor(k)) expect('BRF').toContain(l[l.length - 1]);
    }
    expect(isShortlisted('BB_vs_LP_srp_reg_ip', 'B-X-X')).toBe(false);
    expect(isShortlisted('BB_vs_LP_srp_reg_oop', 'XC-X-XC')).toBe(false);
  });
  it('isShortlisted is per role', () => {
    expect(isShortlisted('BB_vs_LP_srp_reg_ip', 'B-X-B')).toBe(true);
    expect(isShortlisted('BB_vs_LP_srp_reg_ip', 'C-X-B')).toBe(false); // caller-only line
    expect(isShortlisted('SB_vs_BB_srp_reg_ip', 'C-X-B')).toBe(true);
    expect(isShortlisted('BB_vs_LP_srp_reg_ip', 'B-X-BF')).toBe(false); // rare, cut
  });
});

describe('uploadDataKey', () => {
  const body = (matchup, extra = {}) => ({ query: { matchups: [matchup], line: 'B-X-B', ...extra }, data: [] });
  it('groups positions and reads pot / player / perspective', () => {
    expect(uploadDataKey(body('BB vs BTN', { 'Pot Type': ['SRP'] }))).toBe('BB_vs_LP_srp_reg_ip');
    expect(uploadDataKey(body('BB vs CO', { 'Pot Type': ['SRP'], 'IP/OOP': ['OOP'], 'Player Type': ['Fish'] })))
      .toBe('BB_vs_LP_srp_fish_oop');
  });
  it('swaps blind-vs-blind and collapses blind 3-bettors', () => {
    expect(uploadDataKey(body('BB vs SB', { 'Pot Type': ['SRP'] }))).toBe('SB_vs_BB_srp_reg_ip');
    expect(uploadDataKey({ ...body('SB vs BTN'), _potType: '3bp' })).toBe('Blinds_vs_LP_3bp_reg_ip');
    expect(uploadDataKey(body('HJ/LJ vs IP', { 'Pot Type': ['3BP'] }))).toBe('EP_vs_LP_3bp_reg_ip');
  });
  it('returns null without a matchup', () => {
    expect(uploadDataKey({ query: {} })).toBeNull();
  });
});
