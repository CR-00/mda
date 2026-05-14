// Results pane — recreated as the three reference tables: bet-size, facing-size, facing-texture
const { useMemo: useMemo_R } = React;

// Decide which table set to show based on the line state
function detectMode(line, hero, matchup) {
  const m = window.PokerData.MATCHUPS.find(x => x.id === matchup);
  // Whose turn?
  const lastActor = line.length > 0 ? line[line.length - 1].actor : null;
  const street = line.length > 0 ? line[line.length - 1].street : "flop";
  const nextActor = lastActor === m.ip ? m.oop : (lastActor === m.oop ? m.ip : m.oop);
  const lastAction = line.length > 0 ? line[line.length - 1].action : null;

  // If facing a bet/raise → "facing" mode (Size table + Texture table, Call EV)
  // Otherwise → "bet" mode (Bet Size table, Bluff EV)
  const facing = lastAction === "bet" || lastAction === "raise";
  return { mode: facing ? "facing" : "bet", actor: nextActor, street };
}

function ResultsPane({ line, hero, matchup, filters, board }) {
  const ctx = useMemo_R(() => detectMode(line, hero, matchup), [line, matchup]);
  const street = ctx.street.charAt(0).toUpperCase() + ctx.street.slice(1);

  return (
    <div className="results">
      <div className="results-head">
        <div className="rh-titleblock">
          <div className="rh-eyebrow">Next decision</div>
          <div className="rh-title">
            <span className="rh-actor">{ctx.actor}</span>
            <span className="rh-sep">/</span>
            <span className="rh-street">{street.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <Recommendation line={line} hero={hero} matchup={matchup} board={board} mode={ctx.mode} />

      {ctx.mode === "bet" ? (
        <>
          <BetSizeTable line={line} hero={hero} matchup={matchup} board={board} street={ctx.street} />
          <BetTextureTable line={line} hero={hero} matchup={matchup} board={board} street={ctx.street} />
        </>
      ) : (
        <>
          <FacingSizeTable line={line} hero={hero} matchup={matchup} board={board} street={ctx.street} />
          <FacingTextureTable line={line} hero={hero} matchup={matchup} board={board} street={ctx.street} />
        </>
      )}
    </div>
  );
}

function Recommendation({ line, hero, matchup, board, mode }) {
  const data = useMemo_R(() => {
    if (mode === "bet") {
      const t = window.PokerData.getBetSizeTable(line, hero, matchup, board);
      const rows = t.rows.filter(r => r.sample >= 200);
      const bluff = rows.reduce((a, b) => (b.bluffEV > a.bluffEV ? b : a), rows[0]);
      const valueRows = rows.map(r => ({
        ...r,
        valueEV: r.bluffEV * 0.55 + (r.label.includes("%") ? parseInt(r.label) : 0) * 0.18,
      }));
      const value = valueRows.reduce((a, b) => (b.valueEV > a.valueEV ? b : a), valueRows[0]);
      return { mode, cards: [
        { eyebrow: "Best bluff size", value: bluff.label, ev: bluff.bluffEV, evLabel: "EV", sample: bluff.sample, evPos: bluff.bluffEV >= 0 },
        { eyebrow: "Best value size", value: value.label, ev: value.valueEV, evLabel: "EV", sample: value.sample, evPos: value.valueEV >= 0 },
      ]};
    } else {
      // Facing a bet: present TWO direct comparison cards — Call vs Bluff-Raise — at the BEST size for each.
      const t = window.PokerData.getFacingSizeTable(line, hero, matchup, board);
      const rows = t.rows.filter(r => r.sample >= 200);
      // Best call: highest call EV
      const call = rows.reduce((a, b) => (b.callEV > a.callEV ? b : a), rows[0]);
      // Best bluff-raise: combine BR% with bluffPct (population is bluffing, so raising as bluff folds out air)
      // EV proxy: BR% drives fold-equity contribution
      const raiseRows = rows.map(r => ({
        ...r,
        // Ev approximation: when villain BFs, hero wins pot. when villain BCs, hero loses raise. when villain BRs, hero loses more.
        // Pot ~= 25bb, raise ~= 2.5x current bet. Use sized-proxy.
        bluffRaiseEV: (r.next.bf * 25) - (r.next.bc * 18) - (r.next.br * 28),
      }));
      const raise = raiseRows.reduce((a, b) => (b.bluffRaiseEV > a.bluffRaiseEV ? b : a), raiseRows[0]);
      const fold = { ev: 0 };
      // Pick winner across all three options
      const options = [
        { key: "call", label: "Call", value: call.label, ev: call.callEV, sample: call.sample, sub: "best size: " + call.label },
        { key: "bluffraise", label: "Bluff-raise", value: raise.label, ev: raise.bluffRaiseEV, sample: raise.sample, sub: "best size: " + raise.label + " · BF " + (raise.next.bf*100).toFixed(0) + "%" },
        { key: "fold", label: "Fold", value: "—", ev: 0, sample: null, sub: "give up the pot" },
      ];
      const sorted = [...options].sort((a, b) => b.ev - a.ev);
      const winner = sorted[0].key;
      return { mode, cards: options.map(o => ({
        eyebrow: o.label,
        value: o.value,
        ev: o.ev,
        evLabel: "EV",
        sample: o.sample,
        sub: o.sub,
        evPos: o.ev >= 0,
        winner: o.key === winner,
      }))};
    }
  }, [line, hero, matchup, JSON.stringify(board), mode]);

  if (!data) return null;

  return (
    <div className={"reco reco-" + data.mode + " cols-" + data.cards.length}>
      {data.cards.map((c, i) => (
        <div key={i} className={"reco-card" + (c.winner ? " winner" : "")}>
          {c.winner && <div className="reco-pin">Best play</div>}
          <div className="reco-eyebrow">{c.eyebrow}</div>
          <div className="reco-value">{c.value}</div>
          <div className="reco-meta">
            <span className={"reco-ev " + (c.evPos ? "pos" : "neg")}>
              {c.evPos ? "+" : "−"}{Math.abs(c.ev).toFixed(1)}{typeof c.ev === "number" && Math.abs(c.ev) < 30 && data.mode !== "facing" ? "%" : "bb"} {c.evLabel}
            </span>
            {c.sub && <><span className="reco-sep">·</span><span className="reco-sample">{c.sub}</span></>}
            {!c.sub && c.sample && <><span className="reco-sep">·</span><span className="reco-sample">{window.PokerData.fmtCount(c.sample)} hands</span></>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function Donut({ value, max = 100, ring }) {
  // value: 0–100 displayed inside; ring: optional separate ring fill (0–100). default = value
  const r = ring ?? value;
  const pct = Math.max(0, Math.min(100, r));
  const color = pct >= 60 ? "#5fb38a" : pct >= 30 ? "#c8a45c" : "#cc6666";
  const bg = "#262b34";
  const grad = `conic-gradient(${color} ${pct*3.6}deg, ${bg} ${pct*3.6}deg)`;
  return (
    <div className="donut" style={{ background: grad }}>
      <div className="donut-inner">{Math.round(value)}</div>
    </div>
  );
}

function Trend({ delta }) {
  // delta is normalized: positive means "up", magnitude scales
  const abs = Math.abs(delta);
  let cls, glyph;
  if (abs < 0.04) { cls = "flat"; glyph = "→"; }
  else if (delta > 0) { cls = "up"; glyph = "↗"; }
  else { cls = "down"; glyph = "↘"; }
  return <span className={"trend " + cls}>{glyph}</span>;
}

function SampleCell({ row, overall, decimals }) {
  // Sample like "8.9k/16k". orange if low.
  const a = window.PokerData.fmtCount(row.sample);
  const b = window.PokerData.fmtCount(row.ofN);
  const isLow = row.sample < 200;
  return (
    <span className={"sample-text" + (isLow ? " low" : "")}>{a}<span className="sep">/</span>{b}</span>
  );
}

function AvgSizeBar({ pct }) {
  const v = Math.min(pct, 350);
  const w = (v / 350) * 100;
  let cls;
  if (pct >= 200) cls = "huge";
  else if (pct >= 125) cls = "big";
  else if (pct >= 75) cls = "mid";
  else if (pct >= 40) cls = "small";
  else cls = "tiny";
  return (
    <div className={"avgsize-bar avgsize-" + cls}>
      <div className="avgsize-fill" style={{ width: w + "%" }} />
      <div className="avgsize-label">{pct.toFixed(1)}%</div>
    </div>
  );
}

function BluffRangeBar({ bluffPct }) {
  // green→yellow→red gradient bar; bluff label inside the green portion
  const greenW = Math.max(20, bluffPct * 100);
  return (
    <div className="bluff-bar">
      <div className="bluff-bar-grad" />
      <div className="bluff-bar-text" style={{ width: greenW + "%" }}>
        {(bluffPct*100).toFixed(1)}% bluffs
      </div>
    </div>
  );
}

function NextActionCell({ next }) {
  return (
    <div className="next-action">
      <div className="na-item"><div className="na-label">BF</div><div className="na-val bf">{(next.bf*100).toFixed(1)}%</div></div>
      <div className="na-item"><div className="na-label">BC</div><div className="na-val bc">{(next.bc*100).toFixed(1)}%</div></div>
      {next.hasBR && (
        <div className="na-item"><div className="na-label">BR</div><div className="na-val br">{(next.br*100).toFixed(1)}%</div></div>
      )}
    </div>
  );
}

function PotCell({ bb, trend }) {
  return (
    <span className="pot-cell">
      <Trend delta={trend} />
      <span className="pot-num">{bb.toFixed(1).replace(/\.0$/,"")}<span className="unit">bb</span></span>
    </span>
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

function HHsCell() {
  return (
    <button className="hhs-btn" title="View matching hand histories">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
      <span>View</span>
    </button>
  );
}

// ─── Tables ─────────────────────────────────────────────────────────────────

function BetSizeTable({ line, hero, matchup, board, street }) {
  const data = useMemo_R(
    () => window.PokerData.getBetSizeTable(line, hero, matchup, board),
    [line, hero, matchup, JSON.stringify(board)]
  );
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
            <th className="ta-l">{headerLabel}</th>
            <th>Sample</th>
            <th></th>
            <th className="ta-r">Bluff EV</th>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} overall={data.overall} isOverall />
          {data.rows.map((row, i) => (
            <BetSizeRow key={i} row={row} overall={data.overall} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BetSizeRow({ row, overall, isOverall }) {
  const dFreq = (row.freq - overall.freq) / Math.max(overall.freq, 1);
  const dSize = (row.avgSize - overall.avgSize) / Math.max(overall.avgSize, 1);
  const dPot = (row.potSize - overall.potSize) / Math.max(overall.potSize, 1);
  const dEV = (row.bluffEV - overall.bluffEV) / Math.max(Math.abs(overall.bluffEV), 1);

  return (
    <tr className={isOverall ? "overall-row" : ""}>
      <td className="ta-l size-label">{row.label}</td>
      <td className="ta-l"><SampleCell row={row} overall={overall} /></td>
      <td></td>
      <td className="ta-r"><EVCell pct={row.bluffEV} /></td>
    </tr>
  );
}

function BetTextureTable({ line, hero, matchup, board, street }) {
  const data = useMemo_R(() => {
    // Reuse facing-texture generator but adapt fields for Bluff EV display
    const t = window.PokerData.getFacingTextureTable(line, hero, matchup, board);
    const adapt = (row) => ({
      label: row.label,
      freq: row.freq,
      sample: row.sample,
      ofN: row.ofN,
      avgSize: row.avgSize,
      potSize: row.potSize,
      bluffEV: 14 + (row.bluffPct - 0.27) * 100 + (row.callEV * 0.4),
    });
    return { overall: adapt(t.overall), rows: t.rows.map(adapt) };
  }, [line, hero, matchup, JSON.stringify(board)]);

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
            <th className="ta-l">Texture</th>
            <th>Sample</th>
            <th></th>
            <th className="ta-r">Bluff EV</th>
          </tr>
        </thead>
        <tbody>
          <BetSizeRow row={data.overall} overall={data.overall} isOverall />
          {data.rows.map((row, i) => (
            <BetSizeRow key={i} row={row} overall={data.overall} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacingSizeTable({ line, hero, matchup, board, street }) {
  const data = useMemo_R(
    () => window.PokerData.getFacingSizeTable(line, hero, matchup, board),
    [line, hero, matchup, JSON.stringify(board)]
  );

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
            <th className="ta-l">Size</th>
            <th>Sample</th>
            <th>Next Action</th>
            <th className="ta-r">Call EV</th>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} overall={data.overall} isOverall />
          {data.rows.map((row, i) => (
            <FacingRow key={i} row={row} overall={data.overall} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacingTextureTable({ line, hero, matchup, board, street }) {
  const data = useMemo_R(
    () => window.PokerData.getFacingTextureTable(line, hero, matchup, board),
    [line, hero, matchup, JSON.stringify(board)]
  );

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
            <th className="ta-l">Texture</th>
            <th>Sample</th>
            <th>Next Action</th>
            <th className="ta-r">Call EV</th>
          </tr>
        </thead>
        <tbody>
          <FacingRow row={data.overall} overall={data.overall} isOverall isTexture />
          {data.rows.map((row, i) => (
            <FacingRow key={i} row={row} overall={data.overall} isTexture />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FacingRow({ row, overall, isOverall, isTexture }) {
  const dFreq = (row.freq - overall.freq) / Math.max(overall.freq, 1);
  const dBluff = (row.bluffPct - overall.bluffPct);
  const dSize = (row.avgSize - overall.avgSize) / Math.max(overall.avgSize, 1);
  const dPot = (row.potSize - overall.potSize) / Math.max(overall.potSize, 1);
  const dEV = (row.callEV - overall.callEV);

  return (
    <tr className={isOverall ? "overall-row" : ""}>
      <td className="ta-l size-label">{row.label}</td>
      <td className="ta-l">
        <SampleCell row={row} overall={overall} />
      </td>
      <td><NextActionCell next={row.next} /></td>
      <td className="ta-r"><EVCell pct={row.callEV} /></td>
    </tr>
  );
}

window.ResultsPane = ResultsPane;
