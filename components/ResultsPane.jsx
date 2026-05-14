import { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MATCHUPS, fmtCount } from '../lib/data';
import { adaptTableData, computeBoardAdjusted } from '../lib/adaptData';
import { getBoardTextures } from '../lib/boardTextures';
import { BoardInline } from './ConfigBar';

function detectMode(line, hero, matchup) {
  const m = MATCHUPS.find(x => x.id === matchup);
  const lastActor = line.length > 0 ? line[line.length - 1].actor : null;
  const street = line.length > 0 ? line[line.length - 1].street : "flop";
  const nextActor = lastActor === m.ip ? m.oop : (lastActor === m.oop ? m.ip : m.oop);
  const lastAction = line.length > 0 ? line[line.length - 1].action : null;

  const facing = lastAction === "bet" || lastAction === "raise";
  return { mode: facing ? "facing" : "bet", actor: nextActor, street, facingAction: facing ? lastAction : null };
}

export default function ResultsPane({ line, hero, matchup, filters, board, setBoard, spotData, raiseSpotData, onUpload, onSelectNext }) {
  const ctx = useMemo(() => detectMode(line, hero, matchup), [line, matchup]);
  const street = ctx.street.charAt(0).toUpperCase() + ctx.street.slice(1);

  const boardTextures = useMemo(() => getBoardTextures(board), [board]);

  const realSizeData = useMemo(
    () => Array.isArray(spotData) ? adaptTableData(spotData, 'Size') : null,
    [spotData]
  );
  const realRaiseData = useMemo(
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
          </div>
        </div>
        <BoardInline board={board} setBoard={setBoard} />
      </div>

      <Recommendation mode={ctx.mode} data={realSizeData} raiseData={realRaiseData} />

      <TableTabs mode={ctx.mode} street={ctx.street} facingAction={ctx.facingAction} sizeData={realSizeData} textureData={realTextureData} raiseData={realRaiseData} raiseTextureData={realRaiseTextureData} onSelectNext={onSelectNext} />
    </div>
  );
}

// ─── Table tabs ──────────────────────────────────────────────────────────────

function SpotSummary({ mode, facingAction, sizeData, textureData }) {
  const avg = sizeData?.overall;
  const board = textureData?.overall;
  if (!avg) return null;

  const evKey = mode === "bet" ? "bluffEV" : "callEV";
  const evLabel = mode === "bet" ? "Bluff EV" : "Call EV";

  const actionLabel = mode === "bet" ? "bet" : (facingAction ?? "bet");
  const cols = [
    { label: "Average vs " + actionLabel, row: avg },
    ...(board ? [{ label: "This board vs " + actionLabel, row: board }] : []),
  ];

  return (
    <div className="spot-summary">
      {cols.map(({ label, row }) => {
        const ev = row[evKey];
        return (
          <div key={label} className="ss-col">
            <div className="ss-col-label">{label}</div>
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
              <div className="ss-stat ss-stat-ev">
                <span className="ss-stat-label">{evLabel}</span>
                <span className={"ss-stat-val " + (ev >= 0 ? "pos" : "neg")}>
                  {ev >= 0 ? "+" : "−"}{Math.abs(ev).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableTabs({ mode, street, facingAction, sizeData, textureData, raiseData, raiseTextureData, onSelectNext }) {
  const [tab, setTab] = useState("size");
  const showRaiseTabs = mode === "facing" && !!raiseData;
  return (
    <div className="table-tabs">
      <SpotSummary mode={mode} facingAction={facingAction} sizeData={sizeData} textureData={textureData} />
      <div className="ttabs-bar">
        <button className={"ttab" + (tab === "size" ? " active" : "")} onClick={() => setTab("size")}>{mode === "facing" ? "Call EV by size" : "By size"}</button>
        <button className={"ttab" + (tab === "texture" ? " active" : "")} onClick={() => setTab("texture")}>{mode === "facing" ? "Call EV by texture" : "By texture"}</button>
        {showRaiseTabs && (
          <button className={"ttab" + (tab === "raise-size" ? " active" : "")} onClick={() => setTab("raise-size")}>Bluff raise EV by size</button>
        )}
        {showRaiseTabs && (
          <button className={"ttab" + (tab === "raise-texture" ? " active" : "")} onClick={() => setTab("raise-texture")}>Bluff raise EV by texture</button>
        )}
      </div>
      {tab === "size" && (
        mode === "bet"
          ? <BetSizeTable street={street} data={sizeData} onSelectNext={onSelectNext} />
          : <FacingSizeTable street={street} data={sizeData} onSelectNext={onSelectNext} />
      )}
      {tab === "texture" && (
        mode === "bet"
          ? <BetTextureTable street={street} data={textureData} />
          : <FacingTextureTable street={street} data={textureData} onSelectNext={onSelectNext} />
      )}
      {tab === "raise-size" && showRaiseTabs && (
        <RaiseSizeTable street={street} data={raiseData} label="Raise Size" />
      )}
      {tab === "raise-texture" && showRaiseTabs && (
        <RaiseSizeTable street={street} data={raiseTextureData} label="Texture" />
      )}
    </div>
  );
}

// ─── Recommendation ──────────────────────────────────────────────────────────

function Recommendation({ mode, data, raiseData }) {
  if (!data) return null;
  const rows = data.rows.filter(r => r.sample >= 200);
  if (!rows.length) return null;

  let cards;

  if (mode === "bet") {
    const confidence = (r) => r.sample / (r.sample + 400);

    const bluffRows = [...rows]
      .map(r => ({ ...r, rawScore: r.next.bf - r.next.bc * r.sizeRatio }))
      .sort((a, b) => (b.rawScore * confidence(b)) - (a.rawScore * confidence(a)))
      .slice(0, 3);

    const valueRows = [...rows]
      .map(r => ({ ...r, rawScore: r.next.bc * r.sizeRatio - r.next.br }))
      .sort((a, b) => (b.rawScore * confidence(b)) - (a.rawScore * confidence(a)))
      .slice(0, 3);

    cards = [
      { eyebrow: "Top bluff sizes", ranked: true, items: bluffRows.map(r => ({ label: r.label, ev: r.rawScore * 100, evPos: r.rawScore > 0 })) },
      { eyebrow: "Top value sizes", ranked: true, items: valueRows.map(r => ({ label: r.label, ev: r.rawScore * 100, evPos: r.rawScore > 0 })) },
    ];
  } else {
    const confidence = (r) => r.sample / (r.sample + 400);
    const raiseRows = [...(raiseData?.rows?.filter(r => r.sample >= 50) ?? [])]
      .sort((a, b) => (b.bluffEV * confidence(b)) - (a.bluffEV * confidence(a)))
      .slice(0, 3);
    cards = raiseRows.length ? [{
      eyebrow: "Top bluff-raise sizes", ranked: true,
      items: raiseRows.map(r => ({ label: r.label, ev: r.bluffEV, evPos: r.bluffEV >= 0 })),
    }] : [];
  }

  if (!cards.length) return null;

  return (
    <div className={"reco reco-" + mode + " cols-" + cards.length}>
      {cards.map((c, i) => (
        <div key={i} className={"reco-card" + (c.winner ? " winner" : "")}>
          {c.winner && <div className="reco-pin">Best play</div>}
          <div className="reco-eyebrow">{c.eyebrow}</div>
          {c.ranked ? (
            <div className="reco-ranked">
              {c.items.map((item, j) => (
                <div key={j} className="rr-item">
                  <span className="rr-rank">{j + 1}</span>
                  <span className="rr-label">{item.label}</span>
                  <span className={"rr-ev " + (item.evPos ? "pos" : "neg")}>
                    {item.evPos ? "+" : "−"}{Math.abs(item.ev).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="reco-value">{c.value}</div>
              <div className="reco-meta">
                <span className={"reco-ev " + (c.evPos ? "pos" : "neg")}>
                  {c.evPos ? "+" : "−"}{Math.abs(c.ev).toFixed(1)}{c.unit} {c.evLabel}
                </span>
                {c.sub && <><span className="reco-sep">·</span><span className="reco-sample">{c.sub}</span></>}
                {!c.sub && c.sample && <><span className="reco-sep">·</span><span className="reco-sample">{fmtCount(c.sample)} hands</span></>}
              </div>
            </>
          )}
        </div>
      ))}
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
  if (!row.next || !(row.sizeRatio > 0)) return null;
  const mdf = 1 / (1 + row.sizeRatio) * 100;
  const foldPct = row.next.bf * 100;
  const callPct = row.next.bc * 100;
  const ev = (row.next.bf - row.next.bc * row.sizeRatio) * 100;
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
      <div className={"tt-result " + (ev >= 0 ? 'pos' : 'neg')}>{ev >= 0 ? '+' : ''}{ev.toFixed(1)}% EV per bluff</div>
    </div>
  );
}

function CallEVTip({ row }) {
  if (!(row.sizeRatio > 0)) return null;
  const reqEq = row.sizeRatio / (1 + row.sizeRatio) * 100;
  return (
    <div className="tt-content">
      <div className="tt-kv"><span>Bet size</span><span>{(row.sizeRatio * 100).toFixed(0)}% pot</span></div>
      <div className="tt-kv"><span>Required equity</span><span>{reqEq.toFixed(1)}%</span></div>
      <div className="tt-sep" />
      <div className={"tt-result " + (row.callEV >= 0 ? 'pos' : 'neg')}>
        {row.callEV >= 0 ? '+' : ''}{row.callEV.toFixed(1)}% pot EV when calling
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

function NextActionCell({ next, onSelect }) {
  const cls = "na-item" + (onSelect ? " na-clickable" : "");
  return (
    <div className="next-action">
      <div className={cls} onClick={onSelect ? () => onSelect('fold') : undefined}>
        <div className="na-label">BF</div>
        <div className="na-val bf">{(next.bf*100).toFixed(1)}%</div>
      </div>
      <div className={cls} onClick={onSelect ? () => onSelect('call') : undefined}>
        <div className="na-label">BC</div>
        <div className="na-val bc">{(next.bc*100).toFixed(1)}%</div>
      </div>
      {next.hasBR && (
        <div className={cls} onClick={onSelect ? () => onSelect('raise') : undefined}>
          <div className="na-label">BR</div>
          <div className="na-val br">{(next.br*100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}

function EVCell({ pct }) {
  const isPos = pct >= 0;
  return (
    <span className={"ev-cell " + (isPos ? "pos" : "neg")}>
      <Trend delta={isPos ? 1 : -1} />
      <span className="ev-num">{isPos ? "" : "−"}{Math.abs(pct).toFixed(1)}%</span>
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
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : vb - va;
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
  next: r => r.next?.bf ?? 0,
  bluffEV: r => r.bluffEV,
};

function BetSizeTable({ street, data, onSelectNext }) {
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
          <col className="col-next" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">{headerLabel}</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="next" sort={sort} onSort={cycleSort}>Next Action</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} overall={data.overall} isOverall />
          {rows.map((row, i) => <BetSizeRow key={i} row={row} overall={data.overall} onSelectNext={onSelectNext} />)}
        </tbody>
      </table>
    </div>
  );
}

const ACTION_CHAR = { fold: 'f', call: 'c', raise: 'r' };

function BetSizeRow({ row, overall, isOverall, onSelectNext }) {
  const handleSelect = onSelectNext ? (nextAction) => {
    const sizingPct = parseFloat(row.label);
    if (isNaN(sizingPct)) return;
    const ch = ACTION_CHAR[nextAction];
    if (!ch) return;
    onSelectNext([
      { action: 'b', sizing: Math.round(sizingPct) },
      { action: ch, sizing: null },
    ]);
  } : null;

  return (
    <tr className={isOverall ? "overall-row" : ""}>
      <td className="ta-l size-label">{row.label}</td>
      <td className="ta-l"><SampleCell row={row} /></td>
      <td>{row.next && <NextActionCell next={row.next} onSelect={handleSelect} />}</td>
      <td className="ta-r">
        <Tooltip tip={<BluffEVTip row={row} />}>
          <EVCell pct={row.bluffEV} />
        </Tooltip>
      </td>
    </tr>
  );
}

function RaiseSizeTable({ data, label }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, BET_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-betsize">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-next" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">{label}</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="next" sort={sort} onSort={cycleSort}>Next Action</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} overall={data.overall} isOverall />
          {rows.map((row, i) => <BetSizeRow key={i} row={row} overall={data.overall} />)}
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
          <col className="col-next" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Texture</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="next" sort={sort} onSort={cycleSort}>Next Action</SortTh>
            <SortTh col="bluffEV" sort={sort} onSort={cycleSort} className="ta-r">Bluff EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} overall={data.overall} isOverall />
          {rows.map((row, i) => <BetSizeRow key={i} row={row} overall={data.overall} />)}
        </tbody>
      </table>
    </div>
  );
}

const FACING_ACCESSORS = {
  label: r => r.label,
  sample: r => r.sample,
  next: r => r.next.bf,
  callEV: r => r.callEV,
};

function FacingSizeTable({ street, data, onSelectNext }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, FACING_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-facing">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-next" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Size</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="next" sort={sort} onSort={cycleSort}>Next Action</SortTh>
            <SortTh col="callEV" sort={sort} onSort={cycleSort} className="ta-r">Call EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} overall={data.overall} isOverall onSelectNext={onSelectNext} />
          {rows.map((row, i) => <FacingRow key={i} row={row} overall={data.overall} onSelectNext={onSelectNext} />)}
        </tbody>
      </table>
    </div>
  );
}

function FacingTextureTable({ street, data, onSelectNext }) {
  const [sort, cycleSort] = useSortState();
  if (!data) return null;
  const rows = sortRows(data.rows, sort, FACING_ACCESSORS);

  return (
    <div className="data-table-wrap">
      <table className="data-table cols-texture">
        <colgroup>
          <col className="col-label" />
          <col className="col-sample" />
          <col className="col-next" />
          <col className="col-ev" />
        </colgroup>
        <thead>
          <tr>
            <SortTh col="label" sort={sort} onSort={cycleSort} className="ta-l">Texture</SortTh>
            <SortTh col="sample" sort={sort} onSort={cycleSort} className="ta-l">Sample</SortTh>
            <SortTh col="next" sort={sort} onSort={cycleSort}>Next Action</SortTh>
            <SortTh col="callEV" sort={sort} onSort={cycleSort} className="ta-r">Call EV</SortTh>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} overall={data.overall} isOverall isTexture onSelectNext={onSelectNext} />
          {rows.map((row, i) => <FacingRow key={i} row={row} overall={data.overall} isTexture onSelectNext={onSelectNext} />)}
        </tbody>
      </table>
    </div>
  );
}

function FacingRow({ row, overall, isOverall, isTexture, onSelectNext }) {
  const handleSelect = onSelectNext ? (nextAction) => {
    const ch = ACTION_CHAR[nextAction];
    if (!ch) return;
    onSelectNext([{ action: ch, sizing: null }]);
  } : null;

  return (
    <tr className={isOverall ? "overall-row" : ""}>
      <td className="ta-l size-label">{row.label}</td>
      <td className="ta-l"><SampleCell row={row} /></td>
      <td><NextActionCell next={row.next} onSelect={handleSelect} /></td>
      <td className="ta-r">
        <Tooltip tip={<CallEVTip row={row} />}>
          <EVCell pct={row.callEV} />
        </Tooltip>
      </td>
    </tr>
  );
}
