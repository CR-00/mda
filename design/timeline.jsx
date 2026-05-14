// Action timeline — horizontal tree visualization with bet sizings
const { useState: useState_TL, useEffect: useEffect_TL } = React;

const STREETS = ["flop", "turn", "river"];
const ACTION_LABELS = { x: "check", c: "call", f: "fold", b: "bet", r: "raise" };

// Sizing presets (% pot for bets, x prior bet for raises)
const BET_SIZINGS = [
  { id: 33, label: "33" },
  { id: 50, label: "50" },
  { id: 75, label: "75" },
  { id: 125, label: "125" },
];
const RAISE_SIZINGS = [
  { id: 250, label: "2.5x" },
  { id: 300, label: "3x" },
  { id: 400, label: "4x" },
  { id: 9999, label: "allin" },
];

function validNextActions(lastAct) {
  if (lastAct === null || lastAct === "check") return ["x", "b"];
  if (lastAct === "bet" || lastAct === "raise") return ["c", "r"];
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
    const ch = chips[i].action;
    const action = ACTION_LABELS[ch];
    const validHere = validNextActions(lastAct);
    const alternates = validHere.filter(a => a !== ch);

    out.push({
      street: STREETS[streetIdx],
      actor: nextActor,
      action,
      ch,
      sizing: chips[i].sizing || null,
      alternates,
    });

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
  if (!terminated) {
    if (streetIdx < STREETS.length) {
      frontier = {
        street: STREETS[streetIdx],
        actor: nextActor,
        actions: validNextActions(lastAct),
      };
    }
  }

  return { nodes: out, frontier, terminated };
}

function sizingLabel(ch, sizing) {
  if (!sizing) return null;
  if (ch === "b") return sizing + "%";
  if (ch === "r") {
    if (sizing >= 9999) return "allin";
    return (sizing / 100).toFixed(sizing % 100 === 0 ? 0 : 1) + "x";
  }
  return null;
}

function ActionTimeline({ line, setLine, matchup, hero }) {
  const m = window.PokerData.MATCHUPS.find(x => x.id === matchup);
  const ipPos = m.ip, oopPos = m.oop;

  const initialChips = line.filter(a => !a.marker).map(a => ({
    action: a.action === "check" ? "x"
          : a.action === "call" ? "c"
          : a.action === "fold" ? "f"
          : a.action === "bet" ? "b"
          : "r",
    sizing: a.sizing || null,
  }));
  const [chips, setChips] = useState_TL(initialChips);
  // pendingSizing: { mode: 'append'|'swap', ch: 'b'|'r', idx?: number }
  const [pendingSizing, setPendingSizing] = useState_TL(null);

  useEffect_TL(() => {
    const fresh = line.filter(a => !a.marker).map(a => ({
      action: a.action === "check" ? "x"
            : a.action === "call" ? "c"
            : a.action === "fold" ? "f"
            : a.action === "bet" ? "b"
            : "r",
      sizing: a.sizing || null,
    }));
    setChips(fresh);
    setPendingSizing(null);
  }, [matchup]);

  const { nodes, frontier, terminated } = annotatePath(chips, ipPos, oopPos);

  useEffect_TL(() => {
    const out = [];
    let prevStreet = null;
    for (const n of nodes) {
      if (prevStreet && n.street !== prevStreet) {
        out.push({ street: n.street, actor: oopPos, action: "_street_start", sizing: 0, marker: true });
      }
      out.push({ street: n.street, actor: n.actor, action: n.action, sizing: n.sizing || 0 });
      prevStreet = n.street;
    }
    setLine(out);
  }, [chips, ipPos, oopPos]);

  const trimTo = (idx) => { setChips(chips.slice(0, idx)); setPendingSizing(null); };

  const handleFrontierPick = (ch) => {
    if (ch === "b" || ch === "r") {
      setPendingSizing({ mode: "append", ch });
    } else {
      setChips([...chips, { action: ch, sizing: null }]);
      setPendingSizing(null);
    }
  };

  const handleAltPick = (idx, newCh) => {
    if (newCh === "b" || newCh === "r") {
      setPendingSizing({ mode: "swap", ch: newCh, idx });
    } else {
      setChips([...chips.slice(0, idx), { action: newCh, sizing: null }]);
      setPendingSizing(null);
    }
  };

  const commitSizing = (size) => {
    if (!pendingSizing) return;
    if (pendingSizing.mode === "append") {
      setChips([...chips, { action: pendingSizing.ch, sizing: size }]);
    } else {
      setChips([...chips.slice(0, pendingSizing.idx), { action: pendingSizing.ch, sizing: size }]);
    }
    setPendingSizing(null);
  };

  const reset = () => { setChips([]); setPendingSizing(null); };

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
                      <FrontierColumn
                        frontier={frontier}
                        onPick={handleFrontierPick}
                        pendingSizing={pendingSizing && pendingSizing.mode === "append" ? pendingSizing : null}
                        onCommitSizing={commitSizing}
                        onCancelSizing={() => setPendingSizing(null)}
                      />
                    )}
                    {pendingSizing && pendingSizing.mode === "swap" && streetNodes.some(({i}) => i === pendingSizing.idx) && (
                      <SizingPopover
                        ch={pendingSizing.ch}
                        onCommit={commitSizing}
                        onCancel={() => setPendingSizing(null)}
                      />
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
                {nodes[nodes.length-1].action === "fold" ? "Fold" : "Showdown"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeColumn({ selected, alternates, onSelectPath, onSelectAlt, actor }) {
  const sizeStr = sizingLabel(selected.ch, selected.sizing);
  return (
    <div className="tcol">
      <button
        className={"tnode selected vil a-" + selected.action}
        onClick={onSelectPath}
        title="Click to trim line here"
      >
        <span className="tn-actor">{actor}</span>
        <span className="tn-act">{selected.action}</span>
        {sizeStr && <span className="tn-size">{sizeStr}</span>}
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

function FrontierColumn({ frontier, onPick, pendingSizing, onCommitSizing, onCancelSizing }) {
  if (pendingSizing) {
    const presets = pendingSizing.ch === "b" ? BET_SIZINGS : RAISE_SIZINGS;
    return (
      <div className="tcol frontier sizing">
        <div className="tn-frontier-actor vil">{frontier.actor}</div>
        <div className="tn-frontier-stem" />
        <div className="sizing-eyebrow">{pendingSizing.ch === "b" ? "BET %" : "RAISE"}</div>
        <div className="tn-frontier-options">
          {presets.map(p => (
            <button
              key={p.id}
              className="tnode sizing-pick"
              onClick={() => onCommitSizing(p.id)}
            >
              <span className="tn-act">{p.label}</span>
            </button>
          ))}
          <button className="tnode sizing-cancel" onClick={onCancelSizing}>cancel</button>
        </div>
      </div>
    );
  }
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

function SizingPopover({ ch, onCommit, onCancel }) {
  const presets = ch === "b" ? BET_SIZINGS : RAISE_SIZINGS;
  return (
    <div className="tcol frontier sizing standalone">
      <div className="sizing-eyebrow">{ch === "b" ? "BET %" : "RAISE"}</div>
      <div className="tn-frontier-options">
        {presets.map(p => (
          <button key={p.id} className="tnode sizing-pick" onClick={() => onCommit(p.id)}>
            <span className="tn-act">{p.label}</span>
          </button>
        ))}
        <button className="tnode sizing-cancel" onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}

window.ActionTimeline = ActionTimeline;
