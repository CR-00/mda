import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import LineExplorer from '../components/LineExplorer.jsx';

// One representative entry per street, plus a fold (should be filtered out) and a
// sub-minSample row (should not show on the default Min n=50 filter).
const SCAN_RESPONSE = {
  result: {
    // FLOP — facing (ends in B)
    'B': {
      bluffEV: 0, callEV: 5.0,
      next: { bf: 0.6, bc: 0.3, br: 0.1, hasBR: true },
      sample: 300, potSize: 10, sizeRatio: 0.5,
    },
    // FLOP — bet mode (ends in X)
    'X': {
      bluffEV: 4.5, callEV: 0,
      next: { bf: 0.55, bc: 0.4, br: 0.05, hasBR: true },
      sample: 250, potSize: 10, sizeRatio: 0.5,
    },
    // TURN — facing
    'B-B': {
      bluffEV: 0, callEV: -2.1,
      next: { bf: 0.7, bc: 0.25, br: 0.05, hasBR: false },
      sample: 220, potSize: 22, sizeRatio: 0.66,
    },
    // RIVER — bet
    'XC-XC-X': {
      bluffEV: 8.3, callEV: 0,
      next: { bf: 0.65, bc: 0.3, br: 0.05, hasBR: true },
      sample: 500, potSize: 50, sizeRatio: 0.75,
    },
    // FOLD — should be filtered out (classifyLine returns null)
    'BF': {
      bluffEV: 99, callEV: 99,
      next: { bf: 1, bc: 0, br: 0, hasBR: false },
      sample: 1000, potSize: 10, sizeRatio: 0.5,
    },
    // sub-minSample (Min n default = 50) — should not show
    'B-X': {
      bluffEV: 1.1, callEV: 0,
      next: { bf: 0.5, bc: 0.5, br: 0, hasBR: false },
      sample: 12, potSize: 22, sizeRatio: 0.4,
    },
  },
};

function mockScan(data = SCAN_RESPONSE) {
  global.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  }));
}

beforeEach(() => mockScan());
afterEach(() => { delete global.fetch; });

async function waitForTable() {
  await waitFor(() => {
    if (screen.queryByText(/Scanning lines…/)) throw new Error('still loading');
  });
}

describe('LineExplorer — street tab counts', () => {
  it('fetches /api/scan with the matchup key', async () => {
    render(<LineExplorer matchupKey="BB_vs_LP_srp_reg_ip" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/scan?matchup=BB_vs_LP_srp_reg_ip');
  });

  it('counts each street excluding fold lines', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // FLOP: B, X → 2 (not BF)
    // TURN: B-B, B-X (sub-minSample but still classifies) → 2
    // RIVER: XC-XC-X → 1
    const flop = screen.getByRole('button', { name: /Flop/ });
    const turn = screen.getByRole('button', { name: /Turn/ });
    const river = screen.getByRole('button', { name: /River/ });
    expect(within(flop).getByText('2')).toBeInTheDocument();
    expect(within(turn).getByText('2')).toBeInTheDocument();
    expect(within(river).getByText('1')).toBeInTheDocument();
  });
});

describe('LineExplorer — row rendering', () => {
  it('renders the right rows on the default flop tab with Min n=50', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // Should show 'B' and 'X' rows
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    // Should NOT show fold line
    expect(screen.queryByText('BF')).not.toBeInTheDocument();
  });

  it('shows Call EV chip for facing-mode rows, Bluff EV for bet-mode rows', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // 'B' = facing, 'X' = bet
    const chips = screen.getAllByText(/Call EV|Bluff EV/);
    const labels = chips.map(n => n.textContent);
    expect(labels).toContain('Call EV');
    expect(labels).toContain('Bluff EV');
  });

  it('renders EV with one decimal, +/- and a percent sign', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // 'B' has callEV=5.0 (facing) → +5.0%
    expect(screen.getByText(/\+5\.0%/)).toBeInTheDocument();
    // 'X' has bluffEV=4.5 (bet) → +4.5%
    expect(screen.getByText(/\+4\.5%/)).toBeInTheDocument();
  });

  it('renders BF/BC frequencies as whole-percent integers', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // 'B' row: bf=0.6, bc=0.3 → "BF 60%", "BC 30%"
    expect(screen.getByText('BF 60%')).toBeInTheDocument();
    expect(screen.getByText('BC 30%')).toBeInTheDocument();
  });

  it('renders BR only when br > 1%', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // 'B' (br=0.1) → "BR 10%"
    expect(screen.getByText('BR 10%')).toBeInTheDocument();
    // 'X' (br=0.05) → "BR 5%"
    expect(screen.getByText('BR 5%')).toBeInTheDocument();
  });

  it('hides sub-minSample rows on default Min n=50', async () => {
    render(<LineExplorer matchupKey="m" />);
    await waitForTable();
    // 'B-X' on turn tab has sample=12 — won't show even after switching to turn
    // First switch to turn:
    const turnTab = screen.getByRole('button', { name: /Turn/ });
    act(() => { turnTab.click(); });
    await waitFor(() => expect(screen.getByText('B-B')).toBeInTheDocument());
    expect(screen.queryByText('B-X')).not.toBeInTheDocument();
  });
});

describe('LineExplorer — empty states', () => {
  it('shows "No data uploaded" when scan returns empty result', async () => {
    mockScan({ result: {} });
    render(<LineExplorer matchupKey="m" />);
    await waitFor(() => expect(screen.getByText(/No data uploaded/)).toBeInTheDocument());
  });

  it('shows scanning message before fetch resolves', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<LineExplorer matchupKey="m" />);
    expect(screen.getByText(/Scanning lines…/)).toBeInTheDocument();
  });
});
