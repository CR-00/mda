/**
 * Comprehensive routing matrix.
 *
 * For every action-tree terminal shape (facing bet, facing raise, hero just bet,
 * hero on bet/check frontier after a check, villain on bet/check frontier after
 * a check, post-call street boundary, deep multi-street lines), assert:
 *   1. The spot fetch hits the right matchup-file + line.
 *   2. The raise fetch (which surfaces the *other* player's raise EV via
 *      `bluffVev` on a fold row) hits the right matchup-file + line.
 *
 * Cases marked with `it.fails` document known gaps — those are bugs where the
 * speculative routing should fire but currently doesn't.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from '../components/App.jsx';

const CONFIGS = {
  'LP_BB_srp':     { ip: 'LP', oop: 'BB',     pot: 'srp' },
  'BvB_srp':       { ip: 'BB', oop: 'SB',     pot: 'srp' },
  'LP_Blinds_3bp': { ip: 'LP', oop: 'Blinds', pot: '3bp' },
};

function urlOf([matchup, line]) {
  return `/api/data?matchup=${encodeURIComponent(matchup)}&line=${encodeURIComponent(line)}`;
}

function getFetchedUrls() {
  return fetch.mock.calls.map(([url]) => url);
}

function setSearch(params) {
  const usp = new URLSearchParams(params);
  window.history.replaceState(null, '', '?' + usp.toString());
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url.startsWith('/api/scan')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: {} }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
  });
});

afterEach(() => {
  delete global.fetch;
  window.history.replaceState(null, '', '/');
});

async function fetchedUrlsAfterMount({ ip, oop, pot, hero, line, expectedDataCalls = 2 }) {
  setSearch({ ip, oop, pot, hero, line });
  await act(async () => { render(<App />); });
  await waitFor(() => {
    const dataCalls = getFetchedUrls().filter(u => u.startsWith('/api/data'));
    if (dataCalls.length < expectedDataCalls) {
      throw new Error(`only ${dataCalls.length}/${expectedDataCalls}: ${dataCalls.join(' | ')}`);
    }
  }, { timeout: 1500 });
  return getFetchedUrls().filter(u => u.startsWith('/api/data'));
}

// ───────────────────────────────────────────────────────────────────────────
// HERO FACING VILLAIN'S BET / RAISE
//   Spot file = villain's file at villainQueryLine
//   Raise file = villain's fold file → bluffVev = HERO's raise EV
// ───────────────────────────────────────────────────────────────────────────

describe('matrix: hero facing villain bet/raise', () => {
  const CASES = [
    { name: 'donk flop (LP/BB SRP, hero IP)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'b',
      spot:  ['BB_vs_LP_srp_reg_oop', 'B'],
      raise: ['BB_vs_LP_srp_reg_oop', 'BF'] },
    { name: 'cbet flop (LP/BB SRP, hero OOP)',
      cfg: 'LP_BB_srp', hero: 'BB', line: 'xb',
      spot:  ['BB_vs_LP_srp_reg_ip',  'B'],
      raise: ['BB_vs_LP_srp_reg_ip',  'BF'] },
    { name: 'flop raise (LP/BB SRP, hero IP facing OOP raise)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xbr',
      spot:  ['BB_vs_LP_srp_reg_oop', 'XR'],
      raise: ['BB_vs_LP_srp_reg_oop', 'XRF'] },
    { name: 'donk + raise (BvB SRP, hero OOP facing 3bet)',
      cfg: 'BvB_srp', hero: 'SB', line: 'br',
      spot:  ['SB_vs_BB_srp_reg_ip',  'R'],
      raise: ['SB_vs_BB_srp_reg_ip',  'RF'] },
    { name: 'turn bet after flop bet+call (LP/BB SRP, hero OOP)',
      cfg: 'LP_BB_srp', hero: 'BB', line: 'xbcxb',
      spot:  ['BB_vs_LP_srp_reg_ip',  'B-B'],
      raise: ['BB_vs_LP_srp_reg_ip',  'B-BF'] },
    { name: 'river bet (LP/BB SRP, hero OOP facing triple-barrel)',
      cfg: 'LP_BB_srp', hero: 'BB', line: 'xbcxbcxb',
      spot:  ['BB_vs_LP_srp_reg_ip',  'B-B-B'],
      raise: ['BB_vs_LP_srp_reg_ip',  'B-B-BF'] },
    { name: '3bp: facing cbet (LP_Blinds_3bp, hero=Blinds)',
      cfg: 'LP_Blinds_3bp', hero: 'Blinds', line: 'xb',
      spot:  ['Blinds_vs_LP_3bp_reg_ip', 'B'],
      raise: ['Blinds_vs_LP_3bp_reg_ip', 'BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HERO IS AGGRESSOR (just bet or raised)
//   Spot file = hero's file at queryLine (hero's bluff EV from BF/BC/BR rows)
//   Raise file = hero's fold file → bluffVev = VILLAIN's raise EV
// ───────────────────────────────────────────────────────────────────────────

describe('matrix: hero just bet or raised', () => {
  const CASES = [
    { name: 'cbet flop (LP/BB SRP, hero IP)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xb',
      spot:  ['BB_vs_LP_srp_reg_ip', 'B'],
      raise: ['BB_vs_LP_srp_reg_ip', 'BF'] },
    { name: 'donk flop (BvB SRP, hero OOP=SB)',
      cfg: 'BvB_srp', hero: 'SB', line: 'b',
      spot:  ['SB_vs_BB_srp_reg_oop', 'B'],
      raise: ['SB_vs_BB_srp_reg_oop', 'BF'] },
    { name: 'raise vs donk (LP/BB SRP, hero IP raises donk)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'br',
      spot:  ['BB_vs_LP_srp_reg_ip', 'R'],
      raise: ['BB_vs_LP_srp_reg_ip', 'RF'] },
    { name: 'turn bet after flop bet+call (BvB SRP, hero OOP)',
      cfg: 'BvB_srp', hero: 'SB', line: 'bcb',
      spot:  ['SB_vs_BB_srp_reg_oop', 'B-B'],
      raise: ['SB_vs_BB_srp_reg_oop', 'B-BF'] },
    { name: 'river bet (LP/BB SRP, hero IP triple-barrel)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xbcxbcxb',
      spot:  ['BB_vs_LP_srp_reg_ip', 'B-B-B'],
      raise: ['BB_vs_LP_srp_reg_ip', 'B-B-BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HERO ON BET/CHECK FRONTIER AFTER VILLAIN CHECKED
//   Spot = hero's speculative bet file (hero's bluff EV)
//   Raise = hero's speculative fold file (villain's raise EV)
// ───────────────────────────────────────────────────────────────────────────

describe('matrix: hero on bet/check frontier (after villain check)', () => {
  const CASES = [
    { name: 'OOP checks, hero IP on flop frontier',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'x',
      spot:  ['BB_vs_LP_srp_reg_ip', 'B'],
      raise: ['BB_vs_LP_srp_reg_ip', 'BF'] },
    { name: 'OOP checks turn after flop bet+call (LP/BB SRP, hero IP)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xbcx',
      spot:  ['BB_vs_LP_srp_reg_ip', 'B-B'],
      raise: ['BB_vs_LP_srp_reg_ip', 'B-BF'] },
    { name: 'both check flop → BB checks turn → LP on frontier',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xxx',
      spot:  ['BB_vs_LP_srp_reg_ip', 'X-B'],
      raise: ['BB_vs_LP_srp_reg_ip', 'X-BF'] },
    { name: '3bp: hero on flop frontier after Blinds check',
      cfg: 'LP_Blinds_3bp', hero: 'LP', line: 'x',
      spot:  ['Blinds_vs_LP_3bp_reg_ip', 'B'],
      raise: ['Blinds_vs_LP_3bp_reg_ip', 'BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VILLAIN ON BET/CHECK FRONTIER AFTER HERO CHECKED
//   Spot = villain's speculative bet file (villain's bluff EV)
//   Raise = villain's speculative fold file (hero's raise EV)
// ───────────────────────────────────────────────────────────────────────────

describe('matrix: villain on bet/check frontier (after hero check)', () => {
  const CASES = [
    { name: 'hero OOP checks flop, villain IP on frontier',
      cfg: 'BvB_srp', hero: 'SB', line: 'x',
      spot:  ['SB_vs_BB_srp_reg_ip', 'B'],
      raise: ['SB_vs_BB_srp_reg_ip', 'BF'] },
    { name: 'hero checks turn after flop bet+call (BvB SRP, hero OOP)',
      cfg: 'BvB_srp', hero: 'SB', line: 'bcx',
      spot:  ['SB_vs_BB_srp_reg_ip', 'C-B'],
      raise: ['SB_vs_BB_srp_reg_ip', 'C-BF'] },
    { name: 'hero checks river after long line (BvB SRP)',
      cfg: 'BvB_srp', hero: 'SB', line: 'brcxxx',
      spot:  ['SB_vs_BB_srp_reg_ip', 'R-X-B'],
      raise: ['SB_vs_BB_srp_reg_ip', 'R-X-BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// STREET BOUNDARY VIA CALL — currently NOT handled. After a call ends a
// street, the OOP player is up on the next street with a bet/check decision,
// so speculation should fire on a call the same way it fires on a check.
// ───────────────────────────────────────────────────────────────────────────

describe('matrix: street boundary via call (hero on new-street frontier)', () => {
  const CASES = [
    { name: 'flop bet → call: hero OOP needs turn-bet speculation',
      cfg: 'BvB_srp', hero: 'SB', line: 'bc',
      spot:  ['SB_vs_BB_srp_reg_oop', 'B-B'],
      raise: ['SB_vs_BB_srp_reg_oop', 'B-BF'] },
    { name: 'flop bet → call → BB checks turn → LP bets → BB calls: turn complete, river fresh',
      cfg: 'LP_BB_srp', hero: 'BB', line: 'xbcxbc',
      spot:  ['BB_vs_LP_srp_reg_oop', 'XC-XC-B'],
      raise: ['BB_vs_LP_srp_reg_oop', 'XC-XC-BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});

describe('matrix: lines without a snap-generated speculative bet file', () => {
  // chips='bcxbrc' (BvB SRP, hero=SB): donk flop, BB call, check turn, BB bet,
  // SB raise, BB call. SB is on the river bet/check frontier and the speculative
  // line for "SB bets river" is 'B-XR-B'. That line is *not* in ALL_LINES.river,
  // so the file legitimately doesn't exist — the user sees "No data for this
  // spot". Routing must still aim at the right URL so that if the export ever
  // covers this line in the future, it surfaces correctly.
  it('chips=bcxbrc speculative URL is B-XR-B even though snap does not generate it', async () => {
    const urls = await fetchedUrlsAfterMount({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB', line: 'bcxbrc',
    });
    expect(urls).toContain(urlOf(['SB_vs_BB_srp_reg_oop', 'B-XR-B']));
    expect(urls).toContain(urlOf(['SB_vs_BB_srp_reg_oop', 'B-XR-BF']));
  });
});

describe('matrix: street boundary via call (villain on new-street frontier)', () => {
  const CASES = [
    { name: 'flop bet → call: villain OOP needs turn-bet speculation (hero IP)',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'xbc',
      spot:  ['BB_vs_LP_srp_reg_oop', 'XC-B'],
      raise: ['BB_vs_LP_srp_reg_oop', 'XC-BF'] },
    { name: 'donk + raise + call: villain BB OOP on turn frontier',
      cfg: 'LP_BB_srp', hero: 'LP', line: 'brc',
      spot:  ['BB_vs_LP_srp_reg_oop', 'BC-B'],
      raise: ['BB_vs_LP_srp_reg_oop', 'BC-BF'] },
  ];

  CASES.forEach((c) => {
    it(c.name, async () => {
      const cfg = CONFIGS[c.cfg];
      const urls = await fetchedUrlsAfterMount({ ...cfg, hero: c.hero, line: c.line });
      expect(urls).toContain(urlOf(c.spot));
      expect(urls).toContain(urlOf(c.raise));
    });
  });
});
