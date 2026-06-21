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

describe('ResultsPane — size-sequence highlight', () => {
  // Minimal spot with two Size-Sequence rows. A flop bet of 50% pot → token "M".
  const SEQ_SPOT = [
    { metric: 'Overall', value: 'Overall', action: 'B', hits: 1000, opps: 2000, pctPot: 0.5, pot: 10, nextActions: { BF: 600, BC: 350, BR: 50 } },
    { metric: 'Size Sequence', value: 'S', action: 'B', hits: 300, opps: 600, pctPot: 0.3, pot: 10, nextActions: { BF: 200, BC: 90, BR: 10 } },
    { metric: 'Size Sequence', value: 'M', action: 'B', hits: 200, opps: 400, pctPot: 0.5, pot: 10, nextActions: { BF: 120, BC: 70, BR: 10 } },
  ];
  // A single flop bet sized 50% (token M), faced by hero.
  const SEQ_LINE = [{ street: 'flop', actor: 'BTN', action: 'bet', sizing: 50 }];

  async function openSeqTab() {
    const tab = screen.getByRole('button', { name: /^Size sequence$/i });
    await act(async () => { tab.click(); });
  }

  it('marks the picked sequence row and tags it', async () => {
    const { container } = renderResults({ line: SEQ_LINE, spotData: SEQ_SPOT });
    await openSeqTab();
    const hl = container.querySelectorAll('tr.row-hl');
    expect(hl).toHaveLength(1);
    expect(within(hl[0]).getByText('M')).toBeInTheDocument();
    expect(within(hl[0]).getByText(/picked/i)).toBeInTheDocument();
  });

  it('does not highlight any row when no size is picked', async () => {
    const noSize = [{ street: 'flop', actor: 'BTN', action: 'bet', sizing: 0 }];
    const { container } = renderResults({ line: noSize, spotData: SEQ_SPOT });
    await openSeqTab();
    expect(container.querySelectorAll('tr.row-hl')).toHaveLength(0);
  });
});

describe('ResultsPane — size-sequence filter', () => {
  // Multi-street spot: two-token sequences. Flop bet picked L, turn unpicked →
  // pattern ['L', null], so only L-* rows should remain when filtering.
  const MS_SPOT = [
    { metric: 'Overall', value: 'Overall', action: 'B', hits: 1000, opps: 2000, pctPot: 0.6, pot: 10, nextActions: { BF: 600, BC: 350, BR: 50 } },
    { metric: 'Size Sequence', value: 'L-S', action: 'B', hits: 400, pctPot: 0.7, pot: 10, nextActions: { BF: 250, BC: 140, BR: 10 } },
    { metric: 'Size Sequence', value: 'L-L', action: 'B', hits: 300, pctPot: 0.8, pot: 10, nextActions: { BF: 200, BC: 90, BR: 10 } },
    { metric: 'Size Sequence', value: 'S-L', action: 'B', hits: 200, pctPot: 0.6, pot: 10, nextActions: { BF: 120, BC: 70, BR: 10 } },
  ];
  // Flop bet 75% (=L) called, turn bet with no size picked → pattern ['L', null].
  const MS_LINE = [
    { street: 'flop', actor: 'BTN', action: 'bet', sizing: 75 },
    { street: 'flop', actor: 'BB', action: 'call', sizing: 0 },
    { street: 'turn', actor: 'BTN', action: 'bet', sizing: 0 },
  ];

  async function openSeqTab() {
    await act(async () => { screen.getByRole('button', { name: /^Size sequence$/i }).click(); });
  }

  it('defaults to filtering to the matching family when the pattern has a wildcard', async () => {
    const { container } = renderResults({ line: MS_LINE, spotData: MS_SPOT });
    await openSeqTab();
    const labels = [...container.querySelectorAll('td.seq-label')].map(td => td.childNodes[0].textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['L-S', 'L-L']));
    expect(labels).not.toContain('S-L');
  });

  it('shows all sequences when the filter is toggled off', async () => {
    const { container } = renderResults({ line: MS_LINE, spotData: MS_SPOT });
    await openSeqTab();
    const checkbox = screen.getByRole('checkbox');
    await act(async () => { checkbox.click(); });
    const labels = [...container.querySelectorAll('td.seq-label')].map(td => td.childNodes[0].textContent.trim());
    expect(labels).toContain('S-L');
  });

  it('badges the best bluff and best value sizes among shown rows', async () => {
    // Three S-M-* river sizes, designed so best bluff ≠ best value.
    //  value = call% × size:  S-M-S 0.8×0.3=.24, S-M-L 0.4×0.8=.32, S-M-OB 0.04×1.5=.06 → L wins
    //  bluff = fold% − call%×size: S-M-OB 0.96−0.06=.90 highest → OB wins
    const SPOT = [
      { metric: 'Overall', value: 'Overall', action: 'B', hits: 1000, opps: 2000, pctPot: 0.6, pot: 10, nextActions: { BF: 600, BC: 350, BR: 50 } },
      { metric: 'Size Sequence', value: 'S-M-S', action: 'B', hits: 500, pctPot: 0.30, pot: 10, nextActions: { BF: 100, BC: 400, BR: 0 } },
      { metric: 'Size Sequence', value: 'S-M-L', action: 'B', hits: 500, pctPot: 0.80, pot: 10, nextActions: { BF: 300, BC: 200, BR: 0 } },
      { metric: 'Size Sequence', value: 'S-M-OB', action: 'B', hits: 500, pctPot: 1.50, pot: 10, nextActions: { BF: 480, BC: 20, BR: 0 } },
    ];
    const LINE = [
      { street: 'flop', actor: 'BB', action: 'bet', sizing: 33 },
      { street: 'flop', actor: 'BTN', action: 'call', sizing: 0 },
      { street: 'turn', actor: 'BB', action: 'bet', sizing: 66 },
      { street: 'turn', actor: 'BTN', action: 'call', sizing: 0 },
    ];
    const { container } = renderResults({ line: LINE, spotData: SPOT, hero: 'BB' });
    await openSeqTab();
    const rowOf = (label) => [...container.querySelectorAll('tbody tr')]
      .find(tr => tr.querySelector('td.seq-label')?.textContent.startsWith(label));
    expect(within(rowOf('S-M-OB')).getByText(/best bluff/i)).toBeInTheDocument();
    expect(within(rowOf('S-M-L')).getByText(/best value/i)).toBeInTheDocument();
    // the two badges are on different rows
    expect(rowOf('S-M-OB').querySelector('.badge-value')).toBeNull();
    expect(rowOf('S-M-L').querySelector('.badge-bluff')).toBeNull();
  });

  // The reported scenario: SB bet flop S / turn M, both called, now choosing a
  // river size (bet mode). The data has 3-token sequences; the filter should
  // append a wildcard for the river and show only S-M-* so river sizes compare.
  it('filters to <committed>-* when choosing the next bet size (bet mode)', async () => {
    const SPOT3 = [
      { metric: 'Overall', value: 'Overall', action: 'B', hits: 1000, opps: 2000, pctPot: 0.6, pot: 10, nextActions: { BF: 600, BC: 350, BR: 50 } },
      { metric: 'Size Sequence', value: 'S-M-S', action: 'B', hits: 300, pctPot: 0.3, pot: 10, nextActions: { BF: 200, BC: 90, BR: 10 } },
      { metric: 'Size Sequence', value: 'S-M-L', action: 'B', hits: 200, pctPot: 0.8, pot: 10, nextActions: { BF: 150, BC: 45, BR: 5 } },
      { metric: 'Size Sequence', value: 'S-L-L', action: 'B', hits: 400, pctPot: 0.8, pot: 10, nextActions: { BF: 260, BC: 130, BR: 10 } },
    ];
    // hero = BB (oop) bet flop 33% (S) / turn 66% (M), BTN called both → river decision.
    const LINE3 = [
      { street: 'flop', actor: 'BB', action: 'bet', sizing: 33 },
      { street: 'flop', actor: 'BTN', action: 'call', sizing: 0 },
      { street: 'turn', actor: 'BB', action: 'bet', sizing: 66 },
      { street: 'turn', actor: 'BTN', action: 'call', sizing: 0 },
    ];
    const { container } = renderResults({ line: LINE3, spotData: SPOT3, hero: 'BB' });
    await openSeqTab();
    const labels = [...container.querySelectorAll('td.seq-label')].map(td => td.childNodes[0].textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['S-M-S', 'S-M-L']));
    expect(labels).not.toContain('S-L-L');
    // the wildcard pattern is advertised (header + filter checkbox label)
    expect(screen.getAllByText(/S-M-\*/).length).toBeGreaterThan(0);
  });
});

describe('ResultsPane — faced-size highlight on by-size tables', () => {
  // hero (BTN) bet 50% → villain (BB) faces a 50% bet.
  const FACE_LINE = [{ street: 'flop', actor: 'BTN', action: 'bet', sizing: 50 }];
  const FACE_SPOT = [
    { metric: 'Overall', value: 'Overall', action: 'B', hits: 1000, opps: 2000, pctPot: 0.5, pot: 10, catchVevPct: 0.1, nextActions: { BF: 600, BC: 350, BR: 50 } },
    { metric: 'Size', value: '33% ', action: 'B', hits: 300, pctPot: 0.33, pot: 10, catchVevPct: 0.05, nextActions: { BF: 200, BC: 90, BR: 10 } },
    { metric: 'Size', value: '50% ', action: 'B', hits: 200, pctPot: 0.5, pot: 10, catchVevPct: 0.12, nextActions: { BF: 120, BC: 70, BR: 10 } },
    { metric: 'Size', value: '75% ', action: 'B', hits: 150, pctPot: 0.75, pot: 10, catchVevPct: 0.2, nextActions: { BF: 110, BC: 35, BR: 5 } },
  ];
  const FACE_RAISE = [
    { metric: 'Overall', value: 'Overall', action: 'F', hits: 500, pctPot: 0.5, pot: 10, bluffVev: 8, nextActions: {} },
    { metric: 'Flop Bet Size', value: '33% ', action: 'F', hits: 200, pctPot: 0.33, pot: 10, bluffVev: 4, nextActions: {} },
    { metric: 'Flop Bet Size', value: '50% ', action: 'F', hits: 150, pctPot: 0.5, pot: 10, bluffVev: 9, nextActions: {} },
  ];

  it('highlights the faced size on the Call EV by size table (default tab)', () => {
    const { container } = renderResults({ line: FACE_LINE, spotData: FACE_SPOT });
    const hl = container.querySelectorAll('tr.row-hl');
    expect(hl).toHaveLength(1);
    expect(within(hl[0]).getByText('50%')).toBeInTheDocument();
    expect(within(hl[0]).getByText(/facing/i)).toBeInTheDocument();
  });

  it('highlights the faced size on the Bluff EV vs size table', async () => {
    const { container } = renderResults({ line: FACE_LINE, spotData: FACE_SPOT, raiseSpotData: FACE_RAISE });
    const tab = screen.getByRole('button', { name: /Bluff EV vs size/i });
    await act(async () => { tab.click(); });
    const hl = container.querySelectorAll('tr.row-hl');
    expect(hl).toHaveLength(1);
    expect(within(hl[0]).getByText('50%')).toBeInTheDocument();
  });
});
