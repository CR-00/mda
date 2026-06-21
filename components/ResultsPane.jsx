import { useMemo, useState, useRef, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const EVUnitCtx = createContext('bb');

function fmtEV(evBB, potSize, evUnit) {
  if (evUnit === 'pct') {
    const v = potSize > 0 ? evBB / potSize * 100 : 0;
    return { v, dp: 1, suffix: '%' };
  }
  return { v: evBB, dp: 2, suffix: ' BB' };
}
import { MATCHUPS, fmtCount } from '../lib/data';
import { adaptTableData, computeBoardAdjusted, applySizeSignals } from '../lib/adaptData';
import { getBoardTextures } from '../lib/boardTextures';
import { inferSizeSequence } from '../lib/sizing';

function detectMode(line, hero, matchup) {
  const m = MATCHUPS.find(x => x.id === matchup);
  const lastActor = line.length > 0 ? line[line.length - 1].actor : null;
  const street = line.length > 0 ? line[line.length - 1].street : "flop";
  const nextActor = lastActor === m.ip ? m.oop : (lastActor === m.oop ? m.ip : m.oop);
  const lastAction = line.length > 0 ? line[line.length - 1].action : null;

  const facing = lastAction === "bet" || lastAction === "raise";
  return { mode: facing ? "facing" : "bet", actor: nextActor, street, facingAction: facing ? lastAction : null };
}

export default function ResultsPane({ line, hero, matchup, filters, board, setBoard, spotData, raiseSpotData, onUpload }) {
  const ctx = useMemo(() => detectMode(line, hero, matchup), [line, matchup]);
  const street = ctx.street.charAt(0).toUpperCase() + ctx.street.slice(1);

  const [evUnit, setEvUnit] = useState('pct');
  useEffect(() => {
    function onKey(e) {
      if (e.shiftKey && e.key === 'B') setEvUnit(u => u === 'bb' ? 'pct' : 'bb');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const boardTextures = useMemo(() => getBoardTextures(board), [board]);

  const realSizeData = useMemo(
    () => Array.isArray(spotData) ? adaptTableData(spotData, 'Size') : null,
    [spotData]
  );
  const realRaiseData = useMemo(() => {
    if (!Array.isArray(raiseSpotData)) return null;
    // Data files have separate 'Flop Bet Size' / 'Turn Bet Size' / 'River Bet Size'
    // metrics. Pick the one matching the current street, otherwise the rows are
    // just the placeholder 'Check' value for streets that haven't been bet on.
    const metric = ctx.street.charAt(0).toUpperCase() + ctx.street.slice(1) + ' Bet Size';
    return adaptTableData(raiseSpotData, metric);
  }, [raiseSpotData, ctx.street]);
  const realBluffRaiseData = useMemo(
    () => Array.isArray(raiseSpotData) ? adaptTableData(raiseSpotData, 'Vs. Raise Size') : null,
    [raiseSpotData]
  );
  const realRaiseTextureData = useMemo(() => {
    if (!Array.isArray(raiseSpotData)) return null;
    const all = adaptTableData(raiseSpotData, 'Texture');
    if (!all || !boardTextures.length) return all;
    const matchSet = new Set(boardTextures);
    const matchingRows = all.rows.filter(r => matchSet.has(r.label));
    const boardOverall = computeBoardAdjusted(all.overall, matchingRows);
    return { overall: boardOverall, rows: matchingRows };
  }, [raiseSpotData, boardTextures]);
  const realTextureData = useMemo(() => {
    if (!Array.isArray(spotData)) return null;
    const all = adaptTableData(spotData, 'Texture');
    if (!all || !boardTextures.length) return all;
    const matchSet = new Set(boardTextures);
    const matchingRows = all.rows.filter(r => matchSet.has(r.label));
    const boardOverall = computeBoardAdjusted(all.overall, matchingRows);
    return { overall: boardOverall, rows: matchingRows };
  }, [spotData, boardTextures]);
  const realSizeSeqData = useMemo(
    () => Array.isArray(spotData) ? adaptTableData(spotData, 'Size Sequence') : null,
    [spotData]
  );
  const raiseSizeSeqData = useMemo(
    () => Array.isArray(raiseSpotData) ? adaptTableData(raiseSpotData, 'Size Sequence') : null,
    [raiseSpotData]
  );

  // Plain Overall rows — the root of the sizing hierarchy (size/path deviations
  // are measured from here, then layered onto the board-adjusted row).
  const plainOverall = useMemo(
    () => Array.isArray(spotData) ? adaptTableData(spotData, 'Overall')?.overall ?? null : null,
    [spotData]
  );
  const raisePlainOverall = useMemo(
    () => Array.isArray(raiseSpotData) ? adaptTableData(raiseSpotData, 'Overall')?.overall ?? null : null,
    [raiseSpotData]
  );

  // The sizing path the user picked on the timeline (e.g. "L-L-L") and the size
  // of the bet currently in question (last bet in the line). Both feed the
  // "This board" weighting; only set when the relevant bet has a size picked.
  const sizeSeq = useMemo(() => inferSizeSequence(line), [line]);
  const currentSize = useMemo(() => {
    const last = line.length ? line[line.length - 1] : null;
    return last && (last.action === 'bet' || last.action === 'raise') ? (last.sizing || 0) : 0;
  }, [line]);

  const seqRow = useMemo(
    () => (sizeSeq && realSizeSeqData) ? realSizeSeqData.rows.find(r => r.label === sizeSeq) ?? null : null,
    [sizeSeq, realSizeSeqData]
  );
  const raiseSeqRow = useMemo(
    () => (sizeSeq && raiseSizeSeqData) ? raiseSizeSeqData.rows.find(r => r.label === sizeSeq) ?? null : null,
    [sizeSeq, raiseSizeSeqData]
  );
  // Match the picked size against a "by size" table's rows (labels like "75%").
  const matchSize = (data) => (currentSize && data)
    ? data.rows.find(r => Math.round(parseFloat(r.label)) === currentSize) ?? null
    : null;
  const sizeRow = useMemo(() => matchSize(realSizeData), [realSizeData, currentSize]);
  const raiseSizeRow = useMemo(() => matchSize(realRaiseData), [realRaiseData, currentSize]);

  // "This board" summary rows, layered toward the picked sizing — exact bet size
  // first (large sample, fine granularity), then the full path (its residual
  // beyond that size). Standalone tables keep the pure board view; only the
  // summary's board column folds sizing in.
  const boardSummary = useMemo(
    () => applySizeSignals(realTextureData?.overall, plainOverall, [
      sizeRow && { kind: 'size', label: `${currentSize}%`, row: sizeRow, sample: sizeRow.sample },
      seqRow && { kind: 'path', label: sizeSeq, row: seqRow, sample: seqRow.sample },
    ]),
    [realTextureData, plainOverall, sizeRow, seqRow, currentSize, sizeSeq]
  );
  const boardSummaryRaise = useMemo(
    () => applySizeSignals(realRaiseTextureData?.overall, raisePlainOverall, [
      raiseSizeRow && { kind: 'size', label: `${currentSize}%`, row: raiseSizeRow, sample: raiseSizeRow.sample },
      raiseSeqRow && { kind: 'path', label: sizeSeq, row: raiseSeqRow, sample: raiseSeqRow.sample },
    ]),
    [realRaiseTextureData, raisePlainOverall, raiseSizeRow, raiseSeqRow, currentSize, sizeSeq]
  );

  if (spotData === null) {
    return (
      <div className="results">
        <div className="empty-state">
          <div className="es-title">No data for this spot</div>
          <div className="es-sub">Upload a JSON file for this matchup and line to see population statistics.</div>
          {onUpload && (
            <button className="ghost-btn es-upload-btn" onClick={onUpload}>Upload JSON</button>
          )}
        </div>
      </div>
    );
  }

  if (spotData === undefined) {
    return (
      <div className="results">
        <div className="empty-state">
          <div className="es-title">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <EVUnitCtx.Provider value={evUnit}>
    <div className="results">
      <div className="results-head">
        <div className="rh-titleblock">
          <div className="rh-eyebrow">Next decision</div>
          <div className="rh-title">
            <span className="rh-actor">{ctx.actor}</span>
            <span className="rh-sep">/</span>
            <span className="rh-street">{street.toUpperCase()}</span>
            {realSizeData?.overall?.potSize > 0 && (
              <>
                <span className="rh-sep">/</span>
                <span className="rh-pot-inline">~{realSizeData.overall.potSize.toFixed(1)}<span className="rh-pot-unit">bb</span></span>
              </>
            )}
            {sizeSeq && (
              <>
                <span className="rh-sep">/</span>
                <span className="rh-sizeseq" title="Inferred bet-size sequence — first bet per street (S 0-45% · M 45-70% · L 70-105% · OB 105%+)">{sizeSeq}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <TableTabs mode={ctx.mode} street={ctx.street} facingAction={ctx.facingAction} sizeData={realSizeData} textureData={realTextureData} raiseData={realRaiseData} raiseTextureData={realRaiseTextureData} bluffRaiseData={realBluffRaiseData} sizeSeqData={realSizeSeqData} boardSummary={boardSummary} boardSummaryRaise={boardSummaryRaise} sizeSeq={sizeSeq} currentSize={currentSize} />
    </div>
    </EVUnitCtx.Provider>
  );
}

// ─── Table tabs ──────────────────────────────────────────────────────────────

function SizeSignalsTip({ signals }) {
  return (
    <div className="tt-content">
      {signals.map((s, i) => (
        <div className="tt-kv" key={i}>
          <span>{s.kind === 'path' ? `Path ${s.label}` : `Bet ${s.label}`}</span>
          <span>{fmtCount(s.sample)} · {Math.round(s.w * 100)}%</span>
        </div>
      ))}
      <div className="tt-sep" />
      <div className="tt-note">Sizing is layered onto the board read: the exact bet size first, then the full path adds only what it shows beyond that size. Each layer is weighted n ÷ (n + 500), so bigger samples count more.</div>
    </div>
  );
}

function SpotSummary({ mode, facingAction, sizeData, textureData, raiseData, raiseTextureData, boardSummary, boardSummaryRaise, sizeSeq }) {
  const avg = sizeData?.overall;
  const board = boardSummary?.row ?? textureData?.overall;
  const boardRaise = boardSummaryRaise?.row ?? raiseTextureData?.overall;
  const seqWeight = boardSummary?.weight ?? 0;
  const evUnit = useContext(EVUnitCtx);
  if (!avg) return null;

  // EV stats per column. In bet mode the spot's own row holds the bluff(-bet) EV.
  // When facing a bet, "Bluff EV" is the bluff-RAISE EV, which lives in the raise
  // data (same source as the "Bluff EV vs size" table) — not the facing node — so
  // the two figures agree. Call EV stays on the facing node.
  const evStats = mode === "bet"
    ? [{ label: "Bluff EV", from: "row", key: "bluffEV" }]
    : [
        { label: "Call EV", from: "row", key: "callEV" },
        { label: "Bluff EV", from: "raise", key: "bluffEV" },
      ];

  const actionLabel = mode === "bet" ? "bet" : (facingAction ?? "bet");
  const seqActive = !!(sizeSeq && seqWeight > 0);
  const cols = [
    { label: "Average vs " + actionLabel, row: avg, raise: raiseData?.overall },
    ...(board ? [{
      label: seqActive ? `This board · ${sizeSeq} vs ${actionLabel}` : `This board vs ${actionLabel}`,
      row: board,
      raise: boardRaise,
      weight: seqActive ? seqWeight : 0,
      signals: boardSummary?.signals,
    }] : []),
  ];

  return (
    <div className="spot-summary">
      {cols.map(({ label, row, raise, weight, signals }) => (
        <div key={label} className="ss-col">
          <div className="ss-col-label">
            {label}
            {weight > 0 && signals?.length > 0 && (
              <Tooltip tip={<SizeSignalsTip signals={signals} />}>
                <span className="ss-seq-weight">{Math.round(weight * 100)}%</span>
              </Tooltip>
            )}
          </div>
          <div className="ss-stats">
            <div className="ss-stat">
              <span className="ss-stat-label">Fold</span>
              <span className="ss-stat-val">{(row.next.bf * 100).toFixed(0)}%</span>
            </div>
            <div className="ss-stat">
              <span className="ss-stat-label">Call</span>
              <span className="ss-stat-val">{(row.next.bc * 100).toFixed(0)}%</span>
            </div>
            {row.next.br > 0.01 && (
              <div className="ss-stat">
                <span className="ss-stat-label">Raise</span>
                <span className="ss-stat-val">{(row.next.br * 100).toFixed(0)}%</span>
              </div>
            )}
            {evStats.map(({ label: evLabel, from, key }) => {
              const src = from === "raise" ? raise : row;
              const raw = src?.[key];
              if (raw == null || Number.isNaN(raw)) return null;
              const { v, dp, suffix } = fmtEV(raw, src.potSize, evUnit);
              return (
                <div key={evLabel} className="ss-stat ss-stat-ev">
                  <span className="ss-stat-label">{evLabel}</span>
                  <span className={"ss-stat-val " + (v >= 0 ? "pos" : "neg")}>
                    {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(dp)}{suffix}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableTabs({ mode, street, facingAction, sizeData, textureData, raiseData, raiseTextureData, bluffRaiseData, sizeSeqData, boardSummary, boardSummaryRaise, sizeSeq, currentSize }) {
  const [tab, setTab] = useState("size");
  const isFacing = mode === "facing";
  // The bluff-raise tabs are always relevant when facing a bet (you can raise),
  // but the underlying data isn't always exported for the spot. Show them as
  // disabled rather than hiding them, so it's clear data is missing vs absent.
  const hasVsSize = !!raiseData;       // also gates the raise-texture tab
  const hasBySize = !!bluffRaiseData;
  const hasSeq = !!(sizeSeqData && sizeSeqData.rows.length);

  const ttab = (id, label, disabled = false) => (
    <button
      className={"ttab" + (tab === id ? " active" : "") + (disabled ? " disabled" : "")}
      onClick={disabled ? undefined : () => setTab(id)}
      disabled={disabled}
      title={disabled ? "No data for this spot" : undefined}
    >{label}</button>
  );

  return (
    <div className="table-tabs">
      <SpotSummary mode={mode} facingAction={facingAction} sizeData={sizeData} textureData={textureData} raiseData={raiseData} raiseTextureData={raiseTextureData} boardSummary={boardSummary} boardSummaryRaise={boardSummaryRaise} sizeSeq={sizeSeq} />
      <div className="ttabs-bar">
        {ttab("size", isFacing ? "Call EV by size" : "By size")}
        {ttab("texture", isFacing ? "Call EV by texture" : "By texture")}
        {isFacing && ttab("raise-size", "Bluff EV vs size", !hasVsSize)}
        {isFacing && ttab("bluff-raise-size", "Bluff EV by size", !hasBySize)}
        {isFacing && ttab("raise-texture", "Bluff EV by texture", !hasVsSize)}
        {ttab("size-seq", "Size sequence", !hasSeq)}
      </div>
      {tab === "size" && (
        mode === "bet"
          ? <BetSizeTable street={street} data={sizeData} />
          : <FacingSizeTable street={street} data={sizeData} highlightSize={currentSize} />
      )}
      {tab === "texture" && (
        mode === "bet"
          ? <BetTextureTable street={street} data={textureData} />
          : <FacingTextureTable street={street} data={textureData} />
      )}
      {tab === "raise-size" && hasVsSize && (
        <RaiseSizeTable street={street} data={raiseData} label="Bet Size" highlightSize={currentSize} />
      )}
      {tab === "raise-texture" && hasVsSize && (
        <RaiseSizeTable street={street} data={raiseTextureData} label="Texture" />
      )}
      {tab === "bluff-raise-size" && hasBySize && (
        <RaiseSizeTable street={street} data={bluffRaiseData} label="Raise Size" />
      )}
      {tab === "size-seq" && hasSeq && (
        <SizeSeqTable data={sizeSeqData} highlight={sizeSeq} />
      )}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function Tooltip({ children, tip }) {
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  if (!tip) return children;
  return (
    <span
      ref={ref}
      className="tt-wrap"
      onMouseEnter={() => setRect(ref.current?.getBoundingClientRect())}
      onMouseLeave={() => setRect(null)}
    >
      {children}
      {rect && createPortal(
        <div className="tt-box" style={{
          bottom: window.innerHeight - rect.top + 8,
          right: window.innerWidth - rect.right,
        }}>
          {tip}
        </div>,
        document.body
      )}
    </span>
  );
}

function BluffEVTip({ row }) {
  const evUnit = useContext(EVUnitCtx);
  if (!row.next || !(row.sizeRatio > 0)) return null;
  const mdf = 1 / (1 + row.sizeRatio) * 100;
  const foldPct = row.next.bf * 100;
  const callPct = row.next.bc * 100;
  const evBB = (row.next.bf - row.next.bc * row.sizeRatio) * row.potSize;
  const { v, dp, suffix } = fmtEV(evBB, row.potSize, evUnit);
  const overFolds = foldPct > (100 - mdf);
  return (
    <div className="tt-content">
      <div className="tt-kv"><span>MDF</span><span>{mdf.toFixed(1)}%</span></div>
      <div className="tt-kv">
        <span>Villain folds</span>
        <span className={overFolds ? 'pos' : 'neg'}>{foldPct.toFixed(1)}%</span>
      </div>
      <div className="tt-sep" />
      <div className="tt-formula">{foldPct.toFixed(1)} − {callPct.toFixed(1)} × {row.sizeRatio.toFixed(2)}</div>
      <div className={"tt-result " + (v >= 0 ? 'pos' : 'neg')}>{v >= 0 ? '+' : ''}{Math.abs(v).toFixed(dp)}{suffix} EV per bluff</div>
    </div>
  );
}

function CallEVTip({ row }) {
  const evUnit = useContext(EVUnitCtx);
  if (!(row.sizeRatio > 0)) return null;
  const reqEq = row.sizeRatio / (1 + row.sizeRatio) * 100;
  const { v, dp, suffix } = fmtEV(row.callEV, row.potSize, evUnit);
  return (
    <div className="tt-content">
      <div className="tt-kv"><span>Bet size</span><span>{(row.sizeRatio * 100).toFixed(0)}% pot</span></div>
      <div className="tt-kv"><span>Required equity</span><span>{reqEq.toFixed(1)}%</span></div>
      <div className="tt-sep" />
      <div className={"tt-result " + (v >= 0 ? 'pos' : 'neg')}>
        {v >= 0 ? '+' : ''}{Math.abs(v).toFixed(dp)}{suffix} EV when calling
      </div>
    </div>
  );
}

function Trend({ delta }) {
  const abs = Math.abs(delta);
  let cls, glyph;
  if (abs < 0.04) { cls = "flat"; glyph = "→"; }
  else if (delta > 0) { cls = "up"; glyph = "↗"; }
  else { cls = "down"; glyph = "↘"; }
  return <span className={"trend " + cls}>{glyph}</span>;
}

function SampleCell({ row }) {
  const a = fmtCount(row.sample);
  const b = fmtCount(row.ofN);
  const isLow = row.sample < 200;
  return (
    <span className={"sample-text" + (isLow ? " low" : "")}>{a}<span className="sep">/</span>{b}</span>
  );
}

function EVCell({ evBB, potSize }) {
  const evUnit = useContext(EVUnitCtx);
  const { v, dp, suffix } = fmtEV(evBB, potSize, evUnit);
  const isPos = v >= 0;
  return (
    <span className={"ev-cell " + (isPos ? "pos" : "neg")}>
      <Trend delta={isPos ? 1 : -1} />
      <span className="ev-num">{isPos ? "+" : "−"}{Math.abs(v).toFixed(dp)}{suffix}</span>
    </span>
  );
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

function useSortState() {
  const [sort, setSort] = useState({ col: null, dir: 'desc' });
  const cycle = (col) => setSort(prev => {
    if (prev.col !== col) return { col, dir: 'desc' };
    if (prev.dir === 'desc') return { col, dir: 'asc' };
    return { col: null, dir: 'desc' };
  });
  return [sort, cycle];
}

function sortRows(rows, sort, accessors) {
  if (!sort.col || !accessors[sort.col]) return rows;
  const get = accessors[sort.col];
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    let cmp;
    if (typeof va === 'string') {
      const na = parseFloat(va), nb = parseFloat(vb);
      cmp = (!isNaN(na) && !isNaN(nb)) ? nb - na : vb.localeCompare(va);
    } else {
      cmp = vb - va;
    }
    return sort.dir === 'asc' ? -cmp : cmp;
  });
}

function SortTh({ col, sort, onSort, className, children }) {
  const active = sort.col === col;
  return (
    <th
      className={'sortable' + (active ? ' sorted' : '') + (className ? ' ' + className : '')}
      onClick={() => onSort(col)}
    >
      {children}
      <span className="sort-icon">{active ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</span>
    </th>
  );
}

// ─── Tables ─────────────────────────────────────────────────────────────────

const BET_ACCESSORS = {
  label: r => r.label,
  sample: r => r.sample,
  bluffEV: r => r.bluffEV,
};

function BetSizeTable({ street, data }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, BET_ACCESSORS);
  const headerLabel = (street === "river" ? "River" : street === "turn" ? "Turn" : "Flop") + " Bet Size";

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-betsize">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">{headerLabel}</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} isOverall />
          {rows.map((row, i) => <BetSizeRow key={i} row={row} />)}
        </tbody>
      </table>
    </div>
  );
}

// True when a size-table row label (e.g. "75% ") matches the faced bet size.
function sizeMatches(label, size) {
  return !!size && Math.round(parseFloat(label)) === size;
}

function BetSizeRow({ row, isOverall, highlight, rowRef }) {
  return (
    <tr className={(isOverall ? "overall-row" : "") + (highlight ? " row-hl" : "")} ref={rowRef || null}>
      <td className="ta-l size-label">{row.label}{highlight && <span className="row-tag">facing</span>}</td>
      <td className="ta-l"><SampleCell row={row} /></td>
      <td className="ta-r">
        <Tooltip tip={<BluffEVTip row={row} />}>
          <EVCell evBB={row.bluffEV} potSize={row.potSize} />
        </Tooltip>
      </td>
    </tr>
  );
}

function RaiseSizeTable({ data, label, highlightSize }) {
  const [sort, cycleSort] = useSortState();
  const hlRef = useRef(null);
  useEffect(() => { hlRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [highlightSize, sort.col, sort.dir]);
  if (!data) return null;
  const rows = sortRows(data.rows, sort, BET_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-betsize">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">{label}</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} isOverall />
          {rows.map((row, i) => {
            const hl = sizeMatches(row.label, highlightSize);
            return <BetSizeRow key={i} row={row} highlight={hl} rowRef={hl ? hlRef : null} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function BetTextureTable({ street, data, boardTextures }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, BET_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-betsize">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Texture</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} isOverall />
          {rows.map((row, i) => <BetSizeRow key={i} row={row} />)}
        </tbody>
      </table>
    </div>
  );
}

const FACING_ACCESSORS = {
  label: r => r.label,
  sample: r => r.sample,
  callEV: r => r.callEV,
};

function FacingSizeTable({ street, data, highlightSize }) {
  const [sort, cycleSort] = useSortState();
  const hlRef = useRef(null);
  useEffect(() => { hlRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [highlightSize, sort.col, sort.dir]);
  if (!data) return null;
  const rows = sortRows(data.rows, sort, FACING_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-facing">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Size</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="callEV" sort={sort} onSort={cycleSort} className="ta-r">Call EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} isOverall />
          {rows.map((row, i) => {
            const hl = sizeMatches(row.label, highlightSize);
            return <FacingRow key={i} row={row} highlight={hl} rowRef={hl ? hlRef : null} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function FacingTextureTable({ street, data }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, FACING_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-texture">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Texture</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="callEV" sort={sort} onSort={cycleSort} className="ta-r">Call EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} isOverall isTexture />
          {rows.map((row, i) => <FacingRow key={i} row={row} isTexture />)}
        </tbody>
      </table>
    </div>
  );
}

function FacingRow({ row, isOverall, isTexture, highlight, rowRef }) {
  return (
    <tr className={(isOverall ? "overall-row" : "") + (highlight ? " row-hl" : "")} ref={rowRef || null}>
      <td className="ta-l size-label">{row.label}{highlight && <span className="row-tag">facing</span>}</td>
      <td className="ta-l"><SampleCell row={row} /></td>
      <td className="ta-r">
        <Tooltip tip={<CallEVTip row={row} />}>
          <EVCell evBB={row.callEV} potSize={row.potSize} />
        </Tooltip>
      </td>
    </tr>
  );
}

const SEQ_ACCESSORS = {
  label: r => r.label,
  sample: r => r.sample,
  fold: r => r.next.bf,
  bluffEV: r => r.bluffEV,
  callEV: r => r.callEV,
};

// One bet-size token per street where a bet went in (flop→turn→river), e.g.
// "S-L-OB". Fold/Bluff EV/Call EV describe villain's response to the *final*
// bet of the sequence, so the table answers "which sizing path folds villain
// out most / bluffs best". Defaults to most-sampled first so the leading rows'
// bluff EV is trustworthy — single-hand sequences carry wild EVs that would
// otherwise dominate a Bluff-EV sort. Click Bluff EV to rank by it directly.
function SizeSeqTable({ data, highlight }) {
  const [sort, cycleSort] = useSortState();
  const base = [...data.rows].sort((a, b) => b.sample - a.sample);
  const rows = sortRows(base, sort, SEQ_ACCESSORS);

  // Scroll the picked sequence into view when it (or the sort) changes.
  const hlRef = useRef(null);
  useEffect(() => {
    hlRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight, sort.col, sort.dir]);

  return (
    <div className="data-table-wrap">
      <div className="seq-legend">
        <span className="seq-legend-label">Per street</span>
        <span><b>S</b> small</span>
        <span><b>M</b> med</span>
        <span><b>L</b> large</span>
        <span><b>OB</b> overbet</span>
      </div>
      <table className="data-table cols-seq">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-fold" />
          <col className="col-ev" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Sequence</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="fold" sort={sort} onSort={cycleSort} className="ta-r">Fold</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
            <SortTh col="callEV" sort={sort} onSort={cycleSort} className="ta-r">Call EV</SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isHl = row.label === highlight;
            return (
            <tr key={i} className={isHl ? "row-hl" : ""} ref={isHl ? hlRef : null}>
              <td className="ta-l size-label seq-label">
                {row.label}
                {isHl && <span className="row-tag">picked</span>}
              </td>
              <td className="ta-l"><SampleCell row={row} /></td>
              <td className="ta-r seq-fold">{(row.next.bf * 100).toFixed(0)}%</td>
              <td className="ta-r">
                <Tooltip tip={<BluffEVTip row={row} />}>
                  <EVCell evBB={row.bluffEV} potSize={row.potSize} />
                </Tooltip>
              </td>
              <td className="ta-r">
                <Tooltip tip={<CallEVTip row={row} />}>
                  <EVCell evBB={row.callEV} potSize={row.potSize} />
                </Tooltip>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
