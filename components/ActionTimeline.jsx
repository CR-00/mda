import { useEffect, forwardRef, useImperativeHandle } from 'react';
import { MATCHUPS } from '../lib/data';
import { SIZE_PRESETS } from '../lib/sizing';

const STREETS = ["flop", "turn", "river"];
const ACTION_LABELS = { x: "check", c: "call", f: "fold", b: "bet", r: "raise" };

function validNextActions(lastAct) {
  if (lastAct === null || lastAct === "check") return ["x", "b"];
  if (lastAct === "bet" || lastAct === "raise") return ["c", "r", "f"];
  return [];
}

function annotatePath(chips, ipPos, oopPos) {
  const out = [];
  let streetIdx = 0;
  let nextActor = oopPos;
  let lastAct = null;
  let onStreetCount = 0;
  let prevOnStreet = null;
  let terminated = false;

  for (let i = 0; i < chips.length; i++) {
    if (terminated) break;
    const ch = chips[i];
    const action = ACTION_LABELS[ch];
    const validHere = validNextActions(lastAct);
    const alternates = validHere.filter(a => a !== ch);

    out.push({ street: STREETS[streetIdx], actor: nextActor, action, ch, alternates });

    onStreetCount++;
    let streetDone = false;
    if (action === "fold") { terminated = true; streetDone = true; }
    else if (action === "call") streetDone = true;
    else if (action === "check" && onStreetCount >= 2 && prevOnStreet === "check") streetDone = true;

    prevOnStreet = action;
    if (streetDone) {
      if (terminated) break;
      streetIdx++;
      if (streetIdx >= STREETS.length) { terminated = true; break; }
      nextActor = oopPos;
      lastAct = null;
      onStreetCount = 0;
      prevOnStreet = null;
    } else {
      nextActor = nextActor === ipPos ? oopPos : ipPos;
      lastAct = action;
    }
  }

  let frontier = null;
  if (!terminated && streetIdx < STREETS.length) {
    frontier = { street: STREETS[streetIdx], actor: nextActor, actions: validNextActions(lastAct) };
  }

  return { nodes: out, frontier, terminated };
}


const ActionTimeline = forwardRef(function ActionTimeline({ line, setLine, matchup, hero, board, setBoard, clearBoardOnReset, chips, setChips, sizes, setSizes }, ref) {
  const m = MATCHUPS.find(x => x.id === matchup);
  const ipPos = m.ip, oopPos = m.oop;

  useImperativeHandle(ref, () => ({
    appendChips(newChips) {
      setChips(prev => [...prev, ...newChips.map(c => c.action)]);
    },
  }));

  const { nodes, frontier, terminated } = annotatePath(chips, ipPos, oopPos);

  // Optional per-betting-action sizes (% of pot), keyed by node index. Owned by
  // App so they persist in the URL; used to infer the size sequence shown in the
  // results header.
  const setSize = (idx, pct) => setSizes(prev => {
    const next = { ...prev };
    if (pct == null) delete next[idx]; else next[idx] = pct;
    return next;
  });

  // Drop sizes whose node no longer exists or is no longer a bet/raise (after a
  // trim or an alternate-action switch), so stale picks don't resurface.
  useEffect(() => {
    setSizes(prev => {
      let changed = false;
      const next = {};
      for (const k of Object.keys(prev)) {
        const n = nodes[+k];
        if (n && (n.action === 'bet' || n.action === 'raise')) next[k] = prev[k];
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [chips]);

  useEffect(() => {
    const out = [];
    let prevStreet = null;
    nodes.forEach((n, i) => {
      if (prevStreet && n.street !== prevStreet) {
        out.push({ street: n.street, actor: oopPos, action: "_street_start", sizing: 0, marker: true });
      }
      const isBet = n.action === "bet" || n.action === "raise";
      out.push({ street: n.street, actor: n.actor, action: n.action, sizing: isBet ? (sizes[i] ?? 0) : 0 });
      prevStreet = n.street;
    });
    setLine(out);
  }, [chips, ipPos, oopPos, sizes]);

  const trimTo = (idx) => setChips(chips.slice(0, idx));
  const handleFrontierPick = (ch) => {
    // Taking the first action at the root resets the spot, so wipe the board too
    // (when the user has opted in). Lets you reset tree + board in one click.
    if (chips.length === 0 && clearBoardOnReset) setBoard([null, null, null, null, null]);
    setChips([...chips, ch]);
  };
  const handleAltPick = (idx, newCh) => setChips([...chips.slice(0, idx), newCh]);
  const reset = () => setChips([]);

  return (
    <div className="timeline">
      <div className="tree-scroll">
        <div className="tree">
          <div className="tree-streets-grid with-header">
            {STREETS.map((s) => {
              const streetNodes = nodes.map((n, i) => ({ n, i })).filter(x => x.n.street === s);
              const hasFrontier = frontier && frontier.street === s;
              const isEmpty = streetNodes.length === 0 && !hasFrontier;
              if (isEmpty) return <div key={s} className="street-group empty" />;
              return (
                <div key={s} className="street-group">
                  <div className="street-group-header">
                    <div className="street-group-label">{s}</div>
                  </div>
                  <div className="street-group-cols">
                    {streetNodes.map(({ n, i }) => (
                      <TreeColumn
                        key={i}
                        selected={n}
                        alternates={n.alternates}
                        onSelectPath={() => trimTo(i + 1)}
                        onSelectAlt={(ch) => handleAltPick(i, ch)}
                        actor={n.actor}
                        size={sizes[i]}
                        onSetSize={(pct) => setSize(i, pct)}
                      />
                    ))}
                    {hasFrontier && (
                      <FrontierColumn frontier={frontier} onPick={handleFrontierPick} />
                    )}
                  </div>
                </div>
              );
            })}
            <button className="ghost-btn tree-clear-btn-abs" onClick={reset} disabled={!chips.length}>CLEAR</button>
          </div>

          {terminated && nodes.length > 0 && (
            <div className="tree-end">
              <div className="te-tag">
                {nodes[nodes.length - 1].action === "fold" ? "Fold" : "Showdown"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default ActionTimeline;

function TreeColumn({ selected, alternates, onSelectPath, onSelectAlt, actor, size, onSetSize }) {
  const isBet = selected.action === "bet" || selected.action === "raise";
  return (
    <div className="tcol">
      <button
        className={"tnode selected vil a-" + selected.action}
        onClick={onSelectPath}
        title="Click to trim line here"
      >
        <span className="tn-actor">{actor}</span>
        <span className="tn-act">{selected.action}</span>
      </button>
      {isBet && (
        <select
          className="tn-size-select"
          value={size ?? ""}
          onChange={(e) => onSetSize(e.target.value === "" ? null : Number(e.target.value))}
          title="Pick a bet size to infer the sizing sequence"
        >
          <option value="">size?</option>
          {SIZE_PRESETS.map(p => <option key={p} value={p}>{p}%</option>)}
        </select>
      )}
      {alternates.length > 0 && (
        <div className="tn-alts">
          <div className="tn-alts-stem" />
          {alternates.map(ch => (
            <button
              key={ch}
              className={"tnode ghost a-" + ACTION_LABELS[ch]}
              onClick={() => onSelectAlt(ch)}
              title={`Switch to ${ACTION_LABELS[ch]}`}
            >
              <span className="tn-act">{ACTION_LABELS[ch]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FrontierColumn({ frontier, onPick }) {
  return (
    <div className="tcol frontier">
      <div className="tn-frontier-actor vil">{frontier.actor}</div>
      <div className="tn-frontier-stem" />
      <div className="tn-frontier-options">
        {frontier.actions.map(ch => (
          <button
            key={ch}
            className={"tnode frontier-pick a-" + ACTION_LABELS[ch]}
            onClick={() => onPick(ch)}
          >
            <span className="tn-act">{ACTION_LABELS[ch]}</span>
            <span className="tn-key">{ch}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
