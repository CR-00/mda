import { useState, useEffect, useMemo } from 'react';
import { fmtCount } from '../lib/data';
import { classifyLine } from '../lib/lines';

const STREETS = ['flop', 'turn', 'river'];

export default function LineExplorer({ matchupKey }) {
  const [raw, setRaw] = useState(null);
  const [street, setStreet] = useState('flop');
  const [sortCol, setSortCol] = useState('ev');
  const [sortDir, setSortDir] = useState('desc');
  const [minSample, setMinSample] = useState(50);

  useEffect(() => {
    setRaw(null);
    fetch(`/api/scan?matchup=${encodeURIComponent(matchupKey)}`)
      .then(r => r.ok ? r.json() : { result: {} })
      .then(d => setRaw(d.result ?? {}));
  }, [matchupKey]);

  const allRows = useMemo(() => {
    if (!raw) return null;
    return Object.entries(raw).flatMap(([lineCode, data]) => {
      const info = classifyLine(lineCode);
      if (!info) return [];
      const ev = info.mode === 'facing' ? data.callEV : data.bluffEV;
      return [{ lineCode, ...info, ev, ...data }];
    });
  }, [raw]);

  const counts = useMemo(() => {
    if (!allRows) return {};
    return Object.fromEntries(STREETS.map(s => [s, allRows.filter(r => r.street === s).length]));
  }, [allRows]);

  const streetRows = useMemo(() => {
    if (!allRows) return [];
    const filtered = allRows.filter(r => r.street === street && r.sample >= minSample);
    return [...filtered].sort((a, b) => {
      if (sortCol === 'line') {
        return sortDir === 'asc' ? a.lineCode.localeCompare(b.lineCode) : b.lineCode.localeCompare(a.lineCode);
      }
      const va = sortCol === 'sample' ? a.sample : a.ev;
      const vb = sortCol === 'sample' ? b.sample : b.ev;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [allRows, street, sortCol, sortDir, minSample]);

  const cycleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  return (
    <div className="line-explorer">
      <div className="le-toolbar">
        <div className="le-street-tabs">
          {STREETS.map(s => (
            <button
              key={s}
              className={`le-tab${street === s ? ' active' : ''}`}
              onClick={() => setStreet(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {counts[s] > 0 && <span className="le-tab-badge">{counts[s]}</span>}
            </button>
          ))}
        </div>
        <div className="le-controls">
          <label className="le-filter-label">
            <span>Min n</span>
            <select className="le-select" value={minSample} onChange={e => setMinSample(+e.target.value)}>
              <option value={0}>All</option>
              <option value={50}>50+</option>
              <option value={200}>200+</option>
              <option value={500}>500+</option>
            </select>
          </label>
          <div className="le-sort-group">
            <span className="le-sort-label">Sort</span>
            {[['ev','EV'], ['sample','n'], ['line','Line']].map(([col, lbl]) => (
              <button
                key={col}
                className={`le-sort-btn${sortCol === col ? ' active' : ''}`}
                onClick={() => cycleSort(col)}
              >
                {lbl}{sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {raw === null ? (
        <div className="le-empty">Scanning lines…</div>
      ) : streetRows.length === 0 ? (
        <div className="le-empty">
          {Object.keys(raw).length === 0
            ? 'No data uploaded for this matchup.'
            : `No ${street} lines${minSample > 0 ? ` with ${minSample}+ hands` : ''}.`}
        </div>
      ) : (
        <div className="le-table-wrap">
          <div className="le-table">
            <div className="le-thead">
              <div className="le-th le-th-line">Line</div>
              <div className="le-th le-th-mode">Metric</div>
              <div className="le-th le-th-freq">Frequencies</div>
              <div className="le-th le-th-ev">EV</div>
              <div className="le-th le-th-n">n</div>
            </div>
            <div className="le-tbody">
              {streetRows.map(row => <ExploitRow key={row.lineCode} row={row} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExploitRow({ row }) {
  const evPos = row.ev >= 0;
  return (
    <div className={`le-row${row.sample < 200 ? ' le-row-dim' : ''}`}>
      <div className="le-td le-td-line">
        <span className="le-line-code">{row.lineCode}</span>
      </div>
      <div className="le-td le-td-mode">
        <span className={`le-mode-chip le-mode-${row.mode}`}>
          {row.mode === 'facing' ? 'Call EV' : 'Bluff EV'}
        </span>
      </div>
      <div className="le-td le-td-freq">
        <FreqBar bf={row.next.bf} bc={row.next.bc} br={row.next.br} />
      </div>
      <div className="le-td le-td-ev">
        <span className={`le-ev-val ${evPos ? 'pos' : 'neg'}`}>
          {evPos ? '+' : '−'}{Math.abs(row.ev).toFixed(1)}%
        </span>
      </div>
      <div className="le-td le-td-n">
        <span className="le-n-val">{fmtCount(row.sample)}</span>
      </div>
    </div>
  );
}

function FreqBar({ bf, bc, br }) {
  const hasBR = br > 0.01;
  return (
    <div className="le-freq">
      <div className="le-freq-bar">
        <div className="lfb-seg lfb-fold" style={{ flex: bf }} />
        <div className="lfb-seg lfb-call" style={{ flex: bc }} />
        {hasBR && <div className="lfb-seg lfb-raise" style={{ flex: br }} />}
      </div>
      <div className="le-freq-nums">
        <span className="lfn-fold">BF {(bf * 100).toFixed(0)}%</span>
        <span className="lfn-call">BC {(bc * 100).toFixed(0)}%</span>
        {hasBR && <span className="lfn-raise">BR {(br * 100).toFixed(0)}%</span>}
      </div>
    </div>
  );
}
