// Configuration bar — IP / OOP / pot type / board, with card picker modal
const { useState } = React;

const IP_POSITIONS = ["BTN", "CO", "MP", "UTG", "BB"];
const OOP_POSITIONS = ["BB", "SB", "UTG", "MP", "CO"];
const POT_TYPES = [
  { id: "srp", label: "SRP", full: "Single raised" },
  { id: "3bp", label: "3BP", full: "3-bet pot" },
  { id: "4bp", label: "4BP", full: "4-bet pot" },
  { id: "limped", label: "LIMP", full: "Limped pot" },
];
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS = [
  { id: "s", glyph: "♠", name: "spades" },
  { id: "h", glyph: "♥", name: "hearts" },
  { id: "d", glyph: "♦", name: "diamonds" },
  { id: "c", glyph: "♣", name: "clubs" },
];
const SLOT_LABELS = ["Flop 1", "Flop 2", "Flop 3", "Turn", "River"];

function isValidCombo(ip, oop) {
  if (ip === oop) return false;
  const postflopOrder = { SB: 0, BB: 1, UTG: 2, MP: 3, CO: 4, BTN: 5 };
  return postflopOrder[ip] > postflopOrder[oop];
}

function ConfigBar({ ipPos, setIpPos, oopPos, setOopPos, potType, setPotType, board, setBoard }) {
  const [pickerSlot, setPickerSlot] = useState(null);

  const onSelect = (card) => {
    const nb = [...board];
    nb[pickerSlot] = card;
    setBoard(nb);
    // auto-advance to next empty slot
    const next = nb.findIndex((c, i) => i > pickerSlot && c === null);
    if (next !== -1) setPickerSlot(next);
    else setPickerSlot(null);
  };

  const onClear = () => {
    const nb = [...board];
    nb[pickerSlot] = null;
    setBoard(nb);
    setPickerSlot(null);
  };

  return (
    <div className="config-bar">
      <div className="config-section">
        <div className="config-label">In position</div>
        <SegRow
          options={IP_POSITIONS.map(p => ({ id: p, label: p, disabled: !isValidCombo(p, oopPos) }))}
          value={ipPos} onChange={setIpPos}
        />
      </div>

      <div className="config-section">
        <div className="config-label">Out of position</div>
        <SegRow
          options={OOP_POSITIONS.map(p => ({ id: p, label: p, disabled: !isValidCombo(ipPos, p) }))}
          value={oopPos} onChange={setOopPos}
        />
      </div>

      <div className="config-section">
        <div className="config-label">Pot type</div>
        <SegRow options={POT_TYPES} value={potType} onChange={setPotType} />
      </div>

      <div className="config-section board-section">
        <div className="config-label">Board</div>
        <div className="board-row">
          {[0,1,2,3,4].map(i => {
            const c = board[i];
            return (
              <button
                key={i}
                className={"card-slot" + (c ? " filled suit-" + c.suit : "") + (pickerSlot === i ? " open" : "")}
                onClick={() => setPickerSlot(i)}
              >
                {c ? (
                  <>
                    <span className="cs-rank">{c.rank}</span>
                    <span className="cs-suit">{ {s:"♠",h:"♥",d:"♦",c:"♣"}[c.suit] }</span>
                  </>
                ) : <span className="cs-street-tag">{["F","F","F","T","R"][i]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {pickerSlot !== null && (
        <CardPicker
          slot={pickerSlot}
          board={board}
          onSelect={onSelect}
          onClear={onClear}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

function CardPicker({ slot, board, onSelect, onClear, onClose }) {
  const [pendingRank, setPendingRank] = useState(null);
  const used = new Set(board.filter((c, i) => c && i !== slot).map(c => c.rank + c.suit));

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tryPick = (rank, suit) => {
    if (used.has(rank + suit)) return;
    onSelect({ rank, suit });
    setPendingRank(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card-picker" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <div>
            <div className="cp-eyebrow">Select card</div>
            <div className="cp-title">{SLOT_LABELS[slot]}</div>
          </div>
          <div className="cp-actions">
            {board[slot] && <button className="cp-clear" onClick={onClear}>Clear</button>}
            <button className="cp-close" onClick={onClose}>esc</button>
          </div>
        </div>

        <div className="cp-grid">
          {RANKS.map(r => (
            <div key={r} className="cp-rank-row">
              <div className="cp-rank-label">{r}</div>
              {SUITS.map(s => {
                const isUsed = used.has(r + s.id);
                return (
                  <button
                    key={s.id}
                    className={"cp-card suit-" + s.id + (isUsed ? " used" : "")}
                    onClick={() => tryPick(r, s.id)}
                    disabled={isUsed}
                    title={isUsed ? "Already on board" : `${r} of ${s.name}`}
                  >
                    <span className="cpc-rank">{r}</span>
                    <span className="cpc-suit">{s.glyph}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cp-hint">52-card deck · already-on-board cards greyed</div>
      </div>
    </div>
  );
}

function SegRow({ options, value, onChange, small }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button
          key={o.id}
          className={"seg-btn" + (small ? " small" : "") + (value === o.id ? " active" : "") + (o.disabled ? " disabled" : "")}
          onClick={() => !o.disabled && onChange(o.id)}
          disabled={o.disabled}
          title={o.full || o.label}
        >{o.label}</button>
      ))}
    </div>
  );
}

window.ConfigBar = ConfigBar;
window.ConfigBarConsts = { IP_POSITIONS, OOP_POSITIONS, POT_TYPES, isValidCombo };
