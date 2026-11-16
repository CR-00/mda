import { useState, useEffect, useRef } from 'react';
import { SHOW_FISH } from '../lib/flags';
import { spotsForMode, findSpot } from '../lib/spots';

export const POT_TYPES = [
  { id: "srp", label: "SRP", full: "Single raised" },
  { id: "3bp", label: "3BP", full: "3-bet pot" },
  { id: "4bp", label: "4BP", full: "4-bet pot" },
];

const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS = [
  { id: "s", glyph: "♠", name: "spades" },
  { id: "h", glyph: "♥", name: "hearts" },
  { id: "d", glyph: "♦", name: "diamonds" },
  { id: "c", glyph: "♣", name: "clubs" },
];
const SUIT_GLYPHS = Object.fromEntries(SUITS.map(s => [s.id, s.glyph]));


const PLAYER_TYPES = [
  { id: "reg", label: "REG" },
  ...(SHOW_FISH ? [{ id: "fish", label: "FISH" }] : []),
];


export default function ConfigBar({ mode = "simple", ipPos, setIpPos, oopPos, setOopPos, potType, setPotType, playerType, setPlayerType, nav, coverageSeq }) {
  const allSpots = spotsForMode(mode);
  // Two levels: pick the pot type, then one of that pot's configurations.
  const pots = POT_TYPES.filter(p => allSpots.some(s => s.pot === p.id));
  const spots = allSpots.filter(s => s.pot === potType);
  const activeSpot = findSpot(mode, ipPos, oopPos, potType)?.id;
  const selectSpot = (s) => { setIpPos(s.ip); setOopPos(s.oop); setPotType(s.pot); };
  const selectPot = (pot) => {
    if (pot === potType) return;
    const first = allSpots.find(s => s.pot === pot);
    if (first) selectSpot(first);
  };

  // Which matchups have uploaded data — drives disabling spot tabs with no data.
  // null = unknown (loading); don't disable until we know. Refetched whenever
  // coverageSeq bumps (after an upload) so newly uploaded spots unlock.
  const [availBases, setAvailBases] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/coverage')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.uploads) return;
        setAvailBases(new Set(Object.keys(d.uploads).map(k => k.replace(/_(ip|oop)$/, ''))));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [coverageSeq]);

  // Matchup base key (no perspective), e.g. "Blinds_vs_EP_3bp_reg".
  const spotBase = (s) => `${s.keyBase}_${playerType}`;
  const isUnavailable = (s) => availBases != null && !availBases.has(spotBase(s));

  return (
    <div className="config-bar">
      <div className="config-section">
        <div className="config-label">Pot</div>
        <SegRow options={pots} value={potType} onChange={selectPot} />
      </div>

      <div className="nav-tab-bar">
        {nav}
        {nav && <div className="nav-divider" />}
        <div className="spot-tabs">
          {spots.map(s => {
            const disabled = isUnavailable(s);
            return (
              <button
                key={s.id}
                className={"spot-tab" + (activeSpot === s.id ? " active" : "") + (disabled ? " disabled" : "")}
                onClick={disabled ? undefined : () => selectSpot(s)}
                disabled={disabled}
                title={disabled ? `${s.label} — no data uploaded` : s.label}
              >{s.label}</button>
            );
          })}
        </div>
      </div>

      {SHOW_FISH && (
        <div className="config-section">
          <div className="config-label">Player type</div>
          <SegRow options={PLAYER_TYPES} value={playerType} onChange={setPlayerType} />
        </div>
      )}
    </div>
  );
}

export function BoardCard({ board, setBoard }) {
  // The slot the next clicked card lands in.
  const [activeSlot, setActiveSlot] = useState(() => {
    const f = board.findIndex(c => c === null);
    return f === -1 ? 4 : f;
  });
  // When the board is emptied from outside (e.g. a settings-driven reset on spot
  // change), drop the active slot back to the flop so the next pick lands there.
  const allEmpty = board.every(c => c === null);
  const prevAllEmpty = useRef(allEmpty);
  useEffect(() => {
    if (allEmpty && !prevAllEmpty.current) setActiveSlot(0);
    prevAllEmpty.current = allEmpty;
  }, [allEmpty]);

  const used = new Set(board.filter((c, i) => c && i !== activeSlot).map(c => c.rank + c.suit));

  const handlePick = (rank, suit) => {
    if (used.has(rank + suit)) return;
    const nb = [...board];
    nb[activeSlot] = { rank, suit };
    setBoard(nb);
    const next = nb.findIndex((c, i) => i > activeSlot && c === null);
    setActiveSlot(next !== -1 ? next : activeSlot);
  };

  const clearSlot = (i, e) => {
    e.stopPropagation();
    const nb = [...board];
    nb[i] = null;
    setBoard(nb);
    setActiveSlot(i);
  };

  const clearAll = () => { setBoard([null, null, null, null, null]); setActiveSlot(0); };

  const slot = (i) => (
    <BoardSlot
      key={i}
      card={board[i]}
      active={activeSlot === i}
      onClick={() => setActiveSlot(i)}
      onClear={(e) => clearSlot(i, e)}
      tag={["F", "F", "F", "T", "R"][i]}
    />
  );

  return (
    <section className="board-card">
      <div className="bm-slots">
        <div className="bm-street-group">
          <div className="bm-street-label">Flop</div>
          <div className="bm-cards">{[0, 1, 2].map(slot)}</div>
        </div>
        <div className="bm-street-divider" />
        <div className="bm-street-group">
          <div className="bm-street-label">Turn</div>
          <div className="bm-cards">{slot(3)}</div>
        </div>
        <div className="bm-street-divider" />
        <div className="bm-street-group">
          <div className="bm-street-label">River</div>
          <div className="bm-cards">{slot(4)}</div>
        </div>
        {board.some(Boolean) && (
          <button className="cp-clear bm-clear" onClick={clearAll}>Clear</button>
        )}
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
    </section>
  );
}

function BoardSlot({ card, active, onClick, onClear, tag }) {
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
        <span className="bm-slot-empty">{tag}</span>
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
