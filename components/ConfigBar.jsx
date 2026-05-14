import { useState, useEffect } from 'react';

const IP_POSITIONS = [
  { id: "LP", label: "LP" },
  { id: "EP", label: "EP" },
  { id: "BB", label: "BB" },
];
const OOP_POSITIONS = ["BB", "SB"];
export const POT_TYPES = [
  { id: "srp", label: "SRP", full: "Single raised" },
  { id: "3bp", label: "3BP", full: "3-bet pot" },
];
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS = [
  { id: "s", glyph: "♠", name: "spades" },
  { id: "h", glyph: "♥", name: "hearts" },
  { id: "d", glyph: "♦", name: "diamonds" },
  { id: "c", glyph: "♣", name: "clubs" },
];
const SUIT_GLYPHS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SLOT_LABELS = ["Flop 1", "Flop 2", "Flop 3", "Turn", "River"];

export function isValidCombo(ip, oop) {
  if (ip === 'LP' || ip === 'EP') return oop === 'BB' || oop === 'SB';
  if (ip === 'BB') return oop === 'SB';
  return false;
}

const PLAYER_TYPES = [
  { id: "reg", label: "REG" },
  { id: "fish", label: "FISH" },
];

export default function ConfigBar({ ipPos, setIpPos, oopPos, setOopPos, potType, setPotType, playerType, setPlayerType, hero, setHero }) {
  return (
    <div className="config-bar">
      <div className="config-section">
        <div className="config-label">In position</div>
        <SegRow options={IP_POSITIONS} value={ipPos} onChange={setIpPos} />
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

      <div className="config-section">
        <div className="config-label">Player type</div>
        <SegRow options={PLAYER_TYPES} value={playerType} onChange={setPlayerType} />
      </div>

      <div className="config-section">
        <div className="config-label">PFR</div>
        <SegRow
          options={[
            { id: ipPos, label: ipPos },
            { id: oopPos, label: oopPos },
          ]}
          value={hero}
          onChange={setHero}
        />
      </div>
    </div>
  );
}

export function BoardInline({ board, setBoard }) {
  const [openAtSlot, setOpenAtSlot] = useState(null);
  return (
    <>
      <div className="board-row board-row-btn" onClick={() => { const f = board.findIndex(c => c === null); setOpenAtSlot(f !== -1 ? f : 0); }}>
        {[0,1,2,3,4].map(i => {
          const c = board[i];
          return (
            <div key={i} className={"card-slot" + (c ? " filled suit-" + c.suit : "")}>
              {c ? (
                <>
                  <span className="cs-rank">{c.rank}</span>
                  <span className="cs-suit">{SUIT_GLYPHS[c.suit]}</span>
                </>
              ) : <span className="cs-street-tag">{["F","F","F","T","R"][i]}</span>}
            </div>
          );
        })}
      </div>
      {openAtSlot !== null && (
        <BoardModal initialSlot={openAtSlot} board={board} setBoard={setBoard} onClose={() => setOpenAtSlot(null)} />
      )}
    </>
  );
}

function BoardModal({ initialSlot, board, setBoard, onClose }) {
  const [activeSlot, setActiveSlot] = useState(initialSlot);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const used = new Set(board.filter((c, i) => c && i !== activeSlot).map(c => c.rank + c.suit));

  const handlePick = (rank, suit) => {
    if (used.has(rank + suit)) return;
    const nb = [...board];
    nb[activeSlot] = { rank, suit };
    setBoard(nb);
    const next = nb.findIndex((c, i) => i > activeSlot && c === null);
    if (next !== -1) setActiveSlot(next);
  };

  const handleClear = (slotIdx, e) => {
    e.stopPropagation();
    const nb = [...board];
    nb[slotIdx] = null;
    setBoard(nb);
    setActiveSlot(slotIdx);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="board-modal" onClick={e => e.stopPropagation()}>
        <div className="bm-head">
          <span className="bm-title">Board</span>
          <div className="bm-head-actions">
            {board.some(c => c !== null) && (
              <button className="cp-clear" onClick={() => setBoard([null,null,null,null,null])}>Clear all</button>
            )}
            <button className="cp-close" onClick={onClose}>esc</button>
          </div>
        </div>

        <div className="bm-slots">
          <div className="bm-street-group">
            <div className="bm-street-label">Flop</div>
            <div className="bm-cards">
              {[0,1,2].map(i => (
                <BoardSlot key={i} card={board[i]} active={activeSlot === i}
                  onClick={() => setActiveSlot(i)}
                  onClear={(e) => handleClear(i, e)} />
              ))}
            </div>
          </div>
          <div className="bm-street-divider" />
          <div className="bm-street-group">
            <div className="bm-street-label">Turn</div>
            <div className="bm-cards">
              <BoardSlot card={board[3]} active={activeSlot === 3}
                onClick={() => setActiveSlot(3)}
                onClear={(e) => handleClear(3, e)} />
            </div>
          </div>
          <div className="bm-street-divider" />
          <div className="bm-street-group">
            <div className="bm-street-label">River</div>
            <div className="bm-cards">
              <BoardSlot card={board[4]} active={activeSlot === 4}
                onClick={() => setActiveSlot(4)}
                onClear={(e) => handleClear(4, e)} />
            </div>
          </div>
        </div>

        <div className="cp-grid">
          {SUITS.map(s => (
            <div key={s.id} className="cp-rank-row">
              {RANKS.map(r => {
                const isUsed = used.has(r + s.id);
                return (
                  <button
                    key={r}
                    className={"cp-card suit-" + s.id + (isUsed ? " used" : "")}
                    onClick={() => handlePick(r, s.id)}
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
      </div>
    </div>
  );
}

function BoardSlot({ card, active, onClick, onClear }) {
  return (
    <div
      className={"bm-slot" + (active ? " active" : "") + (card ? " filled suit-" + card.suit : "")}
      onClick={onClick}
    >
      {card ? (
        <>
          <span className="bm-slot-rank">{card.rank}</span>
          <span className="bm-slot-suit">{SUIT_GLYPHS[card.suit]}</span>
          <button className="bm-slot-clear" onClick={onClear}>×</button>
        </>
      ) : (
        <span className="bm-slot-empty">·</span>
      )}
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
