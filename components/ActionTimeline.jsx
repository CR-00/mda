import { useEffect, forwardRef, useImperativeHandle } from 'react';
import { MATCHUPS } from '../lib/data';

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


const ActionTimeline = forwardRef(function ActionTimeline({ line, setLine, matchup, hero, chips, setChips }, ref) {
  const m = MATCHUPS.find(x => x.id === matchup);
  const ipPos = m.ip, oopPos = m.oop;

  useImperativeHandle(ref, () => ({
    appendChips(newChips) {
      setChips(prev => [...prev, ...newChips.map(c => c.action)]);
    },
  }));

  const { nodes, frontier, terminated } = annotatePath(chips, ipPos, oopPos);

  useEffect(() => {
    const out = [];
    let prevStreet = null;
    for (const n of nodes) {
      if (prevStreet && n.street !== prevStreet) {
        out.push({ street: n.street, actor: oopPos, action: "_street_start", sizing: 0, marker: true });
      }
      out.push({ street: n.street, actor: n.actor, action: n.action, sizing: 0 });
      prevStreet = n.street;
    }
    setLine(out);
  }, [chips, ipPos, oopPos]);

  const trimTo = (idx) => setChips(chips.slice(0, idx));
  const handleFrontierPick = (ch) => setChips([...chips, ch]);
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

function TreeColumn({ selected, alternates, onSelectPath, onSelectAlt, actor }) {
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
