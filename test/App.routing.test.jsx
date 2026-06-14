/**
 * Integration tests for App's data-routing logic.
 *
 * App constructs two /api/data requests per spot:
 *   - "spot" fetch:    spotData for hero's decision (catchVev/etc. for facing, BF/BC/BR for bet)
 *   - "raise" fetch:   raiseSpotData for hero's bluff-raise EV — ALWAYS lives in villain's fold file
 *
 * The non-obvious part is the perspective swap:
 *   - hero is IP and villain bet/raised → fetch villain's OOP file with villain's query line
 *   - hero raised (villain faces) → fetch hero's own file with hero's query line
 *   - hero is OOP → matchup perspective='oop'
 *
 * These tests mount App, prime state via URL params, and observe the URLs that fetch is called with.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from '../components/App.jsx';

function getFetchedUrls() {
  return fetch.mock.calls.map(([url]) => url);
}

function setSearch(params) {
  const usp = new URLSearchParams(params);
  window.history.replaceState(null, '', '?' + usp.toString());
}

beforeEach(() => {
  // Mock fetch — return ok=true with empty data so each tryInOrder loop
  // only fires its FIRST candidate URL (lets us assert on that URL precisely).
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

async function renderAppAndWaitForFetches({ count = 2, ...params }) {
  setSearch(params);
  await act(async () => {
    render(<App />);
  });
  await waitFor(() => {
    const dataCalls = getFetchedUrls().filter(u => u.startsWith('/api/data'));
    if (dataCalls.length < count) {
      throw new Error(`only ${dataCalls.length}/${count} calls; got: ${dataCalls.join(', ')}`);
    }
  });
  return getFetchedUrls().filter(u => u.startsWith('/api/data'));
}

// ─── SRP, hero=IP ────────────────────────────────────────────────────────────

describe('App routing — SRP, hero=IP', () => {
  it('hero bets flop: spot fetch uses hero IP file with hero queryLine "B"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'xb', // BB checks, LP bets
    });
    // Spot fetch: hero is the aggressor, no perspective swap
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=B');
  });

  it('hero bets flop: raise fetch uses HERO\'s fold file (villain might raise) = "BF"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'xb',
    });
    // Hero is the aggressor (LP just bet). To get villain's raise EV vs hero's bet,
    // we look at hero's fold file: matchup=BB_vs_LP_srp_reg_ip, line=queryLine+'F'='BF'.
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=BF');
  });

  it('villain leads (donk) + hero raises: spot uses hero IP file w/ queryLine "R"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'br', // BB leads, LP raises. hero is the last aggressor → use hero file.
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=R');
  });

  it('villain leads (donk) + hero raises: raise fetch uses HERO\'s fold file = "RF"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'br',
    });
    // Hero (LP) is the most recent aggressor after raising BB's donk. To get BB's
    // 3-bet EV vs LP's raise, look in hero's fold file at queryLine+'F'='RF'.
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=RF');
  });
});

// ─── Speculative routing when hero is on a check/bet frontier ───────────────
//
// When villain has just acted but hero hasn't, App should still surface data
// rather than rendering "No data for this spot":
//   - villain bet/raised → fetch villain's file with villainQueryLine
//   - villain checked     → speculatively fetch hero's '…-B' file (bluff EV preview)

describe('App routing — frontier speculation', () => {
  it('villain donk-bets, hero has not responded yet: fetches villain B', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'b', // BB leads, LP has not acted.
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_oop&line=B');
  });

  it('OOP checks, hero IP on bet/check frontier: speculatively fetches hero\'s B file', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'x', // BB checks. LP at flop bet/check frontier.
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=B');
  });

  it('flop bet → call → OOP checks turn: hero speculatively fetches "B-B"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'xbcx', // hero on turn bet/check frontier
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=B-B');
  });

  it('hero checks through to river, villain on bet/check frontier: speculatively fetches villain bet file', async () => {
    // chips: SB bet, BB raise, SB call, SB check turn, BB check turn, SB check river.
    // hero=SB has checked through; BB is on the river bet/check frontier.
    // Should fetch villain (BB)'s speculative bet file: villainQueryLine 'R-X' + '-B' = 'R-X-B',
    // in BB's IP file (perspective='ip' since hero=SB=oop).
    const urls = await renderAppAndWaitForFetches({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB',
      line: 'brcxxx',
    });
    expect(urls).toContain('/api/data?matchup=SB_vs_BB_srp_reg_ip&line=R-X-B');
  });

  it('hero bets multi-street, villain to act: raise fetch uses HERO\'s fold file = "B-BF"', async () => {
    // chips='bcb' (hero=SB): SB bet flop, BB call, SB bet turn. SB is aggressor.
    // BB might fold/call/raise. To get BB's raise EV vs SB's turn bet,
    // fetch SB's fold file: queryLine='B-B' + 'F' = 'B-BF'.
    const urls = await renderAppAndWaitForFetches({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB',
      line: 'bcb',
    });
    expect(urls).toContain('/api/data?matchup=SB_vs_BB_srp_reg_oop&line=B-BF');
  });

  it('does NOT fall back to the upstream call file when the speculative bet file 404s', async () => {
    // chips='bcx', hero=SB: villainSpeculativeLine='C-B'. If 'C-B' doesn't exist,
    // the upstream 'C' (BB's flop call file) would have semantically wrong
    // nextActions (e.g. {XF, XB}) that normalizeNext misinterprets as fold/raise.
    // Make every fetch 404 so we can observe the *full* candidate list — none of
    // them should be the bare upstream 'C'.
    setSearch({ ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB', line: 'bcx' });
    global.fetch = vi.fn((url) =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    );
    await act(async () => { render(<App />); });
    await waitFor(() => {
      const dataCalls = getFetchedUrls().filter(u => u.startsWith('/api/data'));
      // tryInOrder walks the candidate list until something is ok or all 404.
      // Wait until the spot fetch is exhausted (speculative + 5 extensions).
      if (dataCalls.length < 7) throw new Error(`only ${dataCalls.length}`);
    });
    const urls = getFetchedUrls().filter(u => u.startsWith('/api/data'));
    expect(urls).not.toContain('/api/data?matchup=SB_vs_BB_srp_reg_ip&line=C');
  });

  it('hero checks through to river: raise fetch uses villain speculative-bet fold file', async () => {
    // foldKey = villainSpeculativeLine + 'F' = 'R-X-B' + 'F' = 'R-X-BF'
    const urls = await renderAppAndWaitForFetches({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB',
      line: 'brcxxx',
    });
    expect(urls).toContain('/api/data?matchup=SB_vs_BB_srp_reg_ip&line=R-X-BF');
  });
});

// ─── SRP, hero=OOP (BvB: ip=BB, oop=SB) ──────────────────────────────────────

describe('App routing — SRP, BvB hero=OOP', () => {
  it('hero=SB leads: spot fetch uses hero OOP file with queryLine "B"', async () => {
    // BvB SRP: ip=BB, oop=SB. Hero must be OOP (SB) because SB opened.
    const urls = await renderAppAndWaitForFetches({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB',
      line: 'b', // SB leads (donk) — hero is aggressor
    });
    // Perspective = 'oop' because hero is OOP
    expect(urls).toContain('/api/data?matchup=SB_vs_BB_srp_reg_oop&line=B');
  });

  it('hero=SB leads, raise fetch uses HERO\'s fold file: SB_vs_BB_oop&line=BF', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'BB', oop: 'SB', pot: 'srp', hero: 'SB',
      line: 'b',
    });
    // Hero (SB) is the aggressor. To get villain's raise EV vs SB's bet, fetch hero's
    // fold file at queryLine+'F'='BF', in hero's perspective file (oop since hero=SB).
    expect(urls).toContain('/api/data?matchup=SB_vs_BB_srp_reg_oop&line=BF');
  });
});

// ─── 3BP, blinds OOP ─────────────────────────────────────────────────────────

describe('App routing — 3BP, Blinds OOP', () => {
  it('3bet pot, hero=IP, hero bets flop: spot uses IP file with queryLine "B"', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'Blinds', pot: '3bp', hero: 'LP',
      line: 'xb', // Blinds checks, LP bets
    });
    expect(urls).toContain('/api/data?matchup=Blinds_vs_LP_3bp_reg_ip&line=B');
  });

  it('3bet pot, hero=Blinds (3bettor): App forces hero=oop when blinds 3-bet', async () => {
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'Blinds', pot: '3bp', hero: 'Blinds',
      line: 'b', // Blinds donk-bets. hero=Blinds=oop, so perspective='oop'.
    });
    expect(urls).toContain('/api/data?matchup=Blinds_vs_LP_3bp_reg_oop&line=B');
  });
});

// ─── Multi-street routing ────────────────────────────────────────────────────

describe('App routing — multi-street', () => {
  it('B-B (hero bets flop and turn): spot fetch line is "B-B"', async () => {
    // chips: BB checks, LP bets, BB calls, BB checks turn, LP bets
    // LP queryLine = B-B
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP',
      line: 'xbcxb',
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_ip&line=B-B');
  });

  it('hero=OOP check-calls flop, both check turn: speculative river bet line "XC-X-B"', async () => {
    // chips: BB check flop, LP bet, BB call, BB check turn, LP check turn.
    // BB on river bet/check frontier; queryLine='XC-X' + speculative -B = 'XC-X-B'.
    const urls = await renderAppAndWaitForFetches({
      ip: 'LP', oop: 'BB', pot: 'srp', hero: 'BB',
      line: 'xbcxx',
    });
    expect(urls).toContain('/api/data?matchup=BB_vs_LP_srp_reg_oop&line=XC-X-B');
  });
});

// ─── /api/scan is called for explorer ────────────────────────────────────────

describe('App routing — line explorer scan', () => {
  it('renders without scan call when on analyzer view', async () => {
    setSearch({ ip: 'LP', oop: 'BB', pot: 'srp', hero: 'LP', line: 'xb' });
    await act(async () => { render(<App />); });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const scanCalls = getFetchedUrls().filter(u => u.startsWith('/api/scan'));
    expect(scanCalls).toHaveLength(0);
  });
});
