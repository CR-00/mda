import { useState, useEffect } from 'react';
import { SHOW_FISH } from '../lib/flags';

export const POT_TYPES = [
  { id: "srp", label: "SRP", full: "Single raised" },
  { id: "3bp", label: "3BP", full: "3-bet pot" },
];

// The valid IP/OOP/pot combinations the ConfigBar logic permits, surfaced as
// tabs. The PFR/hero is derived from the spot in App.jsx, so it isn't a tab.
const COMMON_SPOTS = [
  { id: "lp_bb_srp",     label: "LP vs BB",         ip: "LP", oop: "BB",     pot: "srp" },
  { id: "ep_bb_srp",     label: "EP vs BB",         ip: "EP", oop: "BB",     pot: "srp" },
  { id: "lp_blinds_3bp", label: "LP vs Blinds 3BP", ip: "LP", oop: "Blinds", pot: "3bp" },
  { id: "ep_blinds_3bp", label: "EP vs Blinds 3BP", ip: "EP", oop: "Blinds", pot: "3bp" },
  { id: "bvb_srp",       label: "BvB",              ip: "BB", oop: "SB",     pot: "srp" },
  { id: "bvb_3bp",       label: "BvB 3BP",          ip: "BB", oop: "SB",     pot: "3bp" },
];

// SRP OOP is always BB; 3bp OOP vs LP/EP collapses BB+SB into 'Blinds'; BvB OOP is SB.
export function getOopOptions(ipPos, potType) {
  if (ipPos === 'BB') return [{ id: 'SB', label: 'SB' }];
  if (potType === '3bp') return [{ id: 'Blinds', label: 'Blinds' }];
  return [{ id: 'BB', label: 'BB' }];
}
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS = [
  { id: "s", glyph: "♠", name: "spades" },
  { id: "h", glyph: "♥", name: "hearts" },
  { id: "d", glyph: "♦", name: "diamonds" },
  { id: "c", glyph: "♣", name: "clubs" },
];
const SUIT_GLYPHS = Object.fromEntries(SUITS.map(s => [s.id, s.glyph]));

export function isValidCombo(ip, oop, potType) {
  return getOopOptions(ip, potType).some(o => o.id === oop);
}

const PLAYER_TYPES = [
  { id: "reg", label: "REG" },
  ...(SHOW_FISH ? [{ id: "fish", label: "FISH" }] : []),
];

export default function ConfigBar({ ipPos, setIpPos, oopPos, setOopPos, potType, setPotType, playerType, setPlayerType, nav }) {
  const activeSpot = COMMON_SPOTS.find(s => s.ip === ipPos && s.oop === oopPos && s.pot === potType)?.id;
  const selectSpot = (s) => { setIpPos(s.ip); setOopPos(s.oop); setPotType(s.pot); };

  // Which matchups have uploaded data — drives disabling spot tabs with no data.
  // null = unknown (loading); don't disable until we know.
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
  }, []);

  // Matchup base key (no perspective), e.g. "Blinds_vs_EP_3bp_reg".
  const spotBase = (s) => `${s.oop}_vs_${s.ip}_${s.pot}_${playerType}`;
  const isUnavailable = (s) => availBases != null && !availBases.has(spotBase(s));

  return (
    <div className="config-bar">
      <div className="nav-tab-bar">
        {nav}
        {nav && <div className="nav-divider" />}
        <div className="spot-tabs">
          {COMMON_SPOTS.map(s => {
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
