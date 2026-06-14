import { describe, it, expect } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import ResultsPane from '../components/ResultsPane.jsx';
import fullBet from './fixtures/full-bet.json';
import fullFacing from './fixtures/full-facing.json';
import fullRaise from './fixtures/full-raise.json';

const EMPTY_BOARD = [null, null, null, null, null];

// matchup id 'btn_bb' is preloaded in lib/data.js → ip=BTN, oop=BB.
const MATCHUP = 'btn_bb';

// last action 'check' → mode 'bet' (hero gets to decide whether to bet)
const BET_LINE = [{ street: 'flop', actor: 'BB', action: 'check', sizing: 0 }];

// last action 'bet' → mode 'facing' (hero faces a bet)
const FACING_LINE = [{ street: 'flop', actor: 'BTN', action: 'bet', sizing: 50 }];

function renderResults(opts = {}) {
  // Use `in` checks so callers can deliberately pass null/undefined.
  const line = 'line' in opts ? opts.line : BET_LINE;
  const board = 'board' in opts ? opts.board : EMPTY_BOARD;
  const spotData = 'spotData' in opts ? opts.spotData : fullBet.data;
  const raiseSpotData = 'raiseSpotData' in opts ? opts.raiseSpotData : null;
  const hero = opts.hero ?? 'BTN';
  return render(
    <ResultsPane
      line={line}
      hero={hero}
      matchup={MATCHUP}
      filters={{ texture: [], pool: [] }}
      board={board}
      setBoard={() => {}}
      spotData={spotData}
      raiseSpotData={raiseSpotData}
      onUpload={() => {}}
      onSelectNext={() => {}}
    />
  );
}

describe('ResultsPane — loading and empty states', () => {
  it('shows loading state when spotData is undefined', () => {
    renderResults({ spotData: undefined });
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows no-data empty state when spotData is null', () => {
    renderResults({ spotData: null });
    expect(screen.getByText(/No data for this spot/)).toBeInTheDocument();
  });
});

describe('ResultsPane — bet mode (hero deciding whether to bet)', () => {
  it('renders header pot size from overall row', () => {
    renderResults();
    // potSize = 10, rendered as "~10.0" with "bb" unit
    expect(screen.getByText(/~10\.0/)).toBeInTheDocument();
    expect(screen.getByText(/bb/i)).toBeInTheDocument();
  });

  it('shows Bluff EV label (not Call EV) in spot summary', () => {
    renderResults();
    expect(screen.getAllByText(/Bluff EV/i).length).toBeGreaterThan(0);
  });

  it('shows the next actor (ip = BTN, hero) and street (FLOP) in header', () => {
    // BB just checked → next decision is BTN's bet → actor displayed = BTN
    const { container } = renderResults();
    const head = container.querySelector('.rh-title');
    expect(within(head).getByText('BTN')).toBeInTheDocument();
    expect(within(head).getByText('FLOP')).toBeInTheDocument();
  });

  it('SpotSummary "Average vs bet" column renders BF/BC/BR percentages from Overall row', () => {
    // Overall: BF:120, BC:60, BR:20  total=200 → 60% / 30% / 10%
    const { container } = renderResults();
    const avgCol = container.querySelector('.spot-summary .ss-col');
    expect(within(avgCol).getByText('60%')).toBeInTheDocument();
    expect(within(avgCol).getByText('30%')).toBeInTheDocument();
    expect(within(avgCol).getByText('10%')).toBeInTheDocument();
  });

  it('SpotSummary "Average vs bet" column renders bluffEV in pct mode (default unit)', () => {
    // bluffEV = (0.6 - 0.3*0.5)*10 = 4.5 BB → as % of pot = 45.0%
    const { container } = renderResults();
    const avgCol = container.querySelector('.spot-summary .ss-col');
    expect(within(avgCol).getByText(/\+45\.0%/)).toBeInTheDocument();
  });

  it('shows "By size" and "By texture" tabs (no bluff EV tabs in bet mode)', () => {
    renderResults();
    expect(screen.getByRole('button', { name: /^By size$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^By texture$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bluff EV vs size/ })).not.toBeInTheDocument();
  });

  it('size table shows each size row with its label', () => {
    renderResults();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('size table next-action cell shows BF/BC/BR with one decimal', () => {
    renderResults();
    // 33%: BF=50, BC=25, BR=5 (total 80) → 62.5% / 31.3% / 6.3%
    expect(screen.getByText('62.5%')).toBeInTheDocument();
    expect(screen.getByText('31.3%')).toBeInTheDocument();
  });
});

describe('ResultsPane — facing mode (hero deciding whether to call)', () => {
  it('shows Call EV label in spot summary', () => {
    renderResults({ line: FACING_LINE, spotData: fullFacing.data });
    expect(screen.getAllByText(/Call EV/i).length).toBeGreaterThan(0);
  });

  it('renders callEV from catchVevPct * pot (in pct mode)', () => {
    // Overall: catchVevPct=0.1, pot=10 → callEV=1 BB → as % of pot = 10.0%
    const { container } = renderResults({ line: FACING_LINE, spotData: fullFacing.data });
    const avgCol = container.querySelector('.spot-summary .ss-col');
    expect(within(avgCol).getByText(/\+10\.0%/)).toBeInTheDocument();
  });

  it('actor in header is now BB (oop responds to IP bet)', () => {
    const { container } = renderResults({ line: FACING_LINE, spotData: fullFacing.data });
    const head = container.querySelector('.rh-title');
    expect(within(head).getByText('BB')).toBeInTheDocument();
  });

  it('exposes Bluff EV tabs when raiseSpotData is supplied', () => {
    renderResults({
      line: FACING_LINE,
      spotData: fullFacing.data,
      raiseSpotData: fullRaise.data,
    });
    expect(screen.getByRole('button', { name: /Bluff EV vs size/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bluff EV by size/i })).toBeInTheDocument();
  });

  it('Bluff EV vs size table uses the CURRENT street\'s metric, not always "River Bet Size"', async () => {
    // User-reported bug: facing a turn bet, the "Bluff EV vs size" table showed
    // only "Overall" and "Check" because it was reading the 'River Bet Size'
    // metric (which only has 'Check' when no river bet happened).
    // For a turn-bet facing scenario, the table must instead read 'Turn Bet Size'
    // rows (50%, 75%, …).
    const TURN_FACING_LINE = [
      { street: 'flop', actor: 'BTN', action: 'bet',   sizing: 50 },
      { street: 'flop', actor: 'BB',  action: 'call',  sizing: 0  },
      { street: 'turn', actor: 'BB',  action: 'check', sizing: 0  },
      { street: 'turn', actor: 'BTN', action: 'bet',   sizing: 66 }, // turn bet
    ];
    const { container } = renderResults({
      line: TURN_FACING_LINE,
      spotData: fullFacing.data,
      raiseSpotData: fullRaise.data,
    });
    // Click the "Bluff EV vs size" tab
    const tab = screen.getByRole('button', { name: /Bluff EV vs size/i });
    await act(async () => { tab.click(); });
    // The table should show turn sizes (50%, 75%), not the river "Check" row.
    const table = container.querySelector('.data-table.cols-betsize');
    expect(within(table).getByText('50%')).toBeInTheDocument();
    expect(within(table).getByText('75%')).toBeInTheDocument();
    expect(within(table).queryByText(/^Check\s*$/)).toBeNull();
  });

  it('omits Bluff EV tabs when raiseSpotData is null', () => {
    renderResults({
      line: FACING_LINE,
      spotData: fullFacing.data,
      raiseSpotData: null,
    });
    expect(screen.queryByRole('button', { name: /Bluff EV vs size/i })).not.toBeInTheDocument();
  });
});

describe('ResultsPane — hero checked through, villain on bet/check frontier', () => {
  // When hero=BTN has checked through and BB is the next-to-act on the bet/check
  // frontier, App passes the unmodified line (last action = hero's check) and
  // villain's data file. ResultsPane should:
  //   - stay in 'bet' mode (last action was check, not bet/raise)
  //   - show actor=BB (next to act) in the header
  //   - show *villain's* Bluff EV — computed from the BF/BC/BR rows of villain's
  //     file, which represent hero's response to villain's hypothetical bet.
  // The user explicitly asked for this — NOT facing mode, NOT call EV.
  const VILLAIN_CHECK_LINE = [
    { street: 'flop', actor: 'BB',  action: 'check', sizing: 0 },
    { street: 'flop', actor: 'BTN', action: 'check', sizing: 0 },
    { street: 'turn', actor: 'BB',  action: 'check', sizing: 0 },
    { street: 'turn', actor: 'BTN', action: 'check', sizing: 0 },
    { street: 'river', actor: 'BB', action: 'check', sizing: 0 },
    { street: 'river', actor: 'BTN', action: 'check', sizing: 0 },
  ];
  // Hero just checked river (last action), villain BB up next.
  const HERO_CHECKED_THROUGH = VILLAIN_CHECK_LINE.slice(0, -1).concat([
    { street: 'river', actor: 'BTN', action: 'check', sizing: 0 },
  ]);

  it('renders in bet mode and shows Bluff EV (not Call EV)', () => {
    const { container } = renderResults({
      line: HERO_CHECKED_THROUGH,
      spotData: fullBet.data, // villain's speculative-bet file
    });
    const summary = container.querySelector('.spot-summary');
    expect(within(summary).getAllByText(/Bluff EV/i).length).toBeGreaterThan(0);
    expect(within(summary).queryByText(/Call EV/i)).toBeNull();
  });

  it('header actor is BB (next-to-act villain), not BTN (hero)', () => {
    const { container } = renderResults({
      line: HERO_CHECKED_THROUGH,
      spotData: fullBet.data,
    });
    const head = container.querySelector('.rh-title');
    expect(within(head).getByText('BB')).toBeInTheDocument();
    expect(within(head).queryByText('BTN')).toBeNull();
  });

  it('shows "By size" tabs (bet mode), no "Bluff EV vs size" tabs', () => {
    renderResults({
      line: HERO_CHECKED_THROUGH,
      spotData: fullBet.data,
      raiseSpotData: null,
    });
    expect(screen.getByRole('button', { name: /^By size$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bluff EV vs size/i })).toBeNull();
  });
});

describe('ResultsPane — bet table EV column', () => {
  it('overall row EV uses the adapted bluffEV (default pct mode)', () => {
    renderResults();
    // Overall bluffEV displays as +45.0%. We test by counting occurrences:
    // it appears in SpotSummary AND in the overall row of the size table.
    const all = screen.getAllByText(/\+45\.0%/);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
