import { describe, it, expect } from 'vitest';
import { SIMPLE_SPOTS, ADVANCED_SPOTS, findSpot, spotDataKey, isOopPfr, isOopPfrBase } from '../lib/spots.js';
import { roleForDataKey } from '../lib/shortlist.js';
import { uploadDataKey, isKnownSpotKey } from '../lib/uploadKey.js';

describe('spot lists', () => {
  it('have unique ids and unique ip/oop/pot combos per mode', () => {
    for (const list of [SIMPLE_SPOTS, ADVANCED_SPOTS]) {
      expect(new Set(list.map(s => s.id)).size).toBe(list.length);
      expect(new Set(list.map(s => `${s.ip}|${s.oop}|${s.pot}`)).size).toBe(list.length);
    }
  });
  it('simple keys match the existing stored data keys', () => {
    expect(SIMPLE_SPOTS.filter(s => s.pot !== '4bp').map(s => s.keyBase)).toEqual([
      'BB_vs_LP_srp', 'BB_vs_EP_srp', 'Blinds_vs_LP_3bp', 'Blinds_vs_EP_3bp',
      'LP_vs_LP_3bp', 'EP_vs_LP_3bp', 'SB_vs_BB_srp', 'SB_vs_BB_3bp',
    ]);
  });
  it('advanced spots use exact positions', () => {
    const btnBb = findSpot('advanced', 'BTN', 'BB', 'srp');
    expect(spotDataKey(btnBb, 'reg', 'ip')).toBe('BB_vs_BTN_srp_reg_ip');
    expect(findSpot('advanced', 'BTN', 'CO', '3bp').keyBase).toBe('CO_vs_BTN_3bp');
    expect(findSpot('advanced', 'LP', 'BB', 'srp')).toBeNull();
    expect(findSpot('simple', 'BTN', 'BB', 'srp')).toBeNull();
  });
  it('BvB and HJ/LJ vs IP share data across modes', () => {
    expect(findSpot('advanced', 'BB', 'SB', 'srp').keyBase).toBe(findSpot('simple', 'BB', 'SB', 'srp').keyBase);
    expect(findSpot('advanced', 'LP', 'EP', '3bp').keyBase).toBe('EP_vs_LP_3bp');
  });
});

describe('isOopPfr', () => {
  it('matches the simple-mode rules', () => {
    expect(isOopPfr('BB', 'SB', 'srp')).toBe(true);
    expect(isOopPfr('LP', 'Blinds', '3bp')).toBe(true);
    expect(isOopPfr('LP', 'BB', 'srp')).toBe(false);
    expect(isOopPfr('BTN', 'CO', '3bp')).toBe(false);
    expect(isOopPfr('BB', 'SB', '3bp')).toBe(false);
  });
  it('treats a blind 3-bettor as OOP PFR in advanced spots', () => {
    expect(isOopPfr('BTN', 'BB', '3bp')).toBe(true);
    expect(isOopPfr('CO', 'SB', '3bp')).toBe(true);
    expect(isOopPfr('BTN', 'BB', 'srp')).toBe(false);
    expect(isOopPfrBase('BB_vs_BTN_3bp')).toBe(true);
    expect(roleForDataKey('BB_vs_BTN_3bp_reg_oop')).toBe('oopPfr');
    expect(roleForDataKey('BB_vs_CO_srp_reg_ip')).toBe('ipPfr');
  });
});

describe('uploadDataKey in advanced mode', () => {
  const body = (matchups, extra = {}) => ({ query: { matchups, line: 'B-X-B', ...extra }, data: [] });
  it('keeps exact seats', () => {
    expect(uploadDataKey(body(['BB vs BTN'], { 'Pot Type': ['SRP'] }), 'advanced')).toBe('BB_vs_BTN_srp_reg_ip');
    expect(uploadDataKey(body(['BB vs BU'], { 'Pot Type': ['3BP'], 'IP/OOP': ['OOP'] }), 'advanced')).toBe('BB_vs_BTN_3bp_reg_oop');
    expect(uploadDataKey(body(['SB vs CO'], { 'Pot Type': ['3BP'] }), 'advanced')).toBe('SB_vs_CO_3bp_reg_ip');
    expect(uploadDataKey(body(['CO vs BTN'], { 'Pot Type': ['3BP'] }), 'advanced')).toBe('CO_vs_BTN_3bp_reg_ip');
    expect(uploadDataKey(body(['BB vs SB'], { 'Pot Type': ['SRP'] }), 'advanced')).toBe('SB_vs_BB_srp_reg_ip');
    expect(uploadDataKey(body(['HJ/LJ vs IP'], { 'Pot Type': ['3BP'] }), 'advanced')).toBe('EP_vs_LP_3bp_reg_ip');
  });
  it('refuses multi-matchup exports', () => {
    expect(uploadDataKey(body(['BB vs BTN', 'BB vs CO'], { 'Pot Type': ['SRP'] }), 'advanced')).toBeNull();
    expect(uploadDataKey(body(['BB vs BTN', 'BB vs CO'], { 'Pot Type': ['SRP'] }))).toBe('BB_vs_LP_srp_reg_ip');
  });
  it('isKnownSpotKey accepts only keys with a spot', () => {
    expect(isKnownSpotKey('BB_vs_BTN_srp_reg_ip')).toBe(true);
    expect(isKnownSpotKey('BB_vs_LP_srp_fish_oop')).toBe(true);
    expect(isKnownSpotKey('SB_vs_BTN_srp_reg_ip')).toBe(false);
    expect(isKnownSpotKey('junk')).toBe(false);
  });
});

describe('4-bet pots', () => {
  it('have spots in both modes', () => {
    expect(SIMPLE_SPOTS.filter(s => s.pot === '4bp').map(s => s.keyBase)).toEqual([
      'Blinds_vs_LP_4bp', 'Blinds_vs_EP_4bp', 'LP_vs_LP_4bp', 'EP_vs_LP_4bp', 'SB_vs_BB_4bp',
    ]);
    expect(ADVANCED_SPOTS.filter(s => s.pot === '4bp')).toHaveLength(11);
    expect(findSpot('advanced', 'BTN', 'BB', '4bp').keyBase).toBe('BB_vs_BTN_4bp');
  });
  it('make the opener (4-bettor) the preflop raiser', () => {
    expect(isOopPfr('LP', 'Blinds', '4bp')).toBe(false); // LP opened, blind 3-bet, LP 4-bet
    expect(isOopPfr('BTN', 'BB', '4bp')).toBe(false);
    expect(isOopPfr('BTN', 'CO', '4bp')).toBe(true);    // CO opened, BTN 3-bet, CO 4-bet
    expect(isOopPfr('LP', 'EP', '4bp')).toBe(true);
    expect(isOopPfr('BB', 'SB', '4bp')).toBe(true);     // SB opened, BB 3-bet, SB 4-bet
    expect(roleForDataKey('Blinds_vs_LP_4bp_reg_ip')).toBe('ipPfr');
    expect(roleForDataKey('SB_vs_BB_4bp_reg_oop')).toBe('oopPfr');
  });
  it('upload keys group blinds like 3BPs', () => {
    const body = (m) => ({ query: { matchups: [m], line: 'B-X-B', 'Pot Type': ['4bp'] }, data: [] });
    expect(uploadDataKey(body('BB vs BTN'))).toBe('Blinds_vs_LP_4bp_reg_ip');
    expect(uploadDataKey(body('SB vs HJ'))).toBe('Blinds_vs_EP_4bp_reg_ip');
    expect(uploadDataKey(body('CO vs BTN'))).toBe('LP_vs_LP_4bp_reg_ip');
    expect(uploadDataKey(body('BB vs BTN'), 'advanced')).toBe('BB_vs_BTN_4bp_reg_ip');
    expect(isKnownSpotKey('Blinds_vs_LP_4bp_reg_ip')).toBe(true);
  });
});
