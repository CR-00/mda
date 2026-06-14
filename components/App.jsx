import { useState, useEffect, useMemo, useRef } from 'react';
import ConfigBar, { POT_TYPES, isValidCombo, getOopOptions } from './ConfigBar';
import ActionTimeline from './ActionTimeline';
import ResultsPane from './ResultsPane';
import UploadModal from './UploadModal';
import CoverageModal from './CoverageModal';
import LineExplorer from './LineExplorer';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } from './TweaksPanel';
import { MATCHUPS, FILTERS } from '../lib/data';
import { deriveQueryLine, matchupToKey } from '../lib/spotMatch';
import { SHOW_FISH } from '../lib/flags';

const DEFAULT_BOARD = [null, null, null, null, null];

function parseBoard(str) {
  if (!str) return DEFAULT_BOARD;
  const cards = [];
  for (let i = 0; i + 1 < str.length; i += 2) {
    cards.push({ rank: str[i], suit: str[i + 1] });
  }
  while (cards.length < 5) cards.push(null);
  return cards;
}

function serializeBoard(board) {
  return board.filter(Boolean).map(c => c.rank + c.suit).join('');
}

const TWEAK_DEFAULTS = {
  density: "compact",
  showOpponentCard: true,
};

function deriveAutoFilters(board) {
  const matched = [];
  FILTERS.texture.forEach(f => {
    if (f.auto && f.auto(board)) matched.push(f);
  });
  return matched;
}

function BurgerMenu({ view, onSetView }) {
  const [open, setOpen] = useState(false);
  const VIEWS = [
    { id: 'analyzer', label: 'Analyzer' },
    { id: 'explorer', label: 'Line Explorer' },
    { id: 'spots', label: 'Spot Browser', href: '/spots' },
    { id: 'exploits', label: 'Exploits', href: '/exploits' },
    { id: 'summary', label: 'Strategy Summary', href: '/summary' },
  ];
  return (
    <>
      <div className="burger-wrap">
        <button
          className={`burger-btn${open ? ' open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-label="Navigation menu"
        >
          <span className="burger-bar" />
          <span className="burger-bar" />
          <span className="burger-bar" />
        </button>
      </div>

      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">Menu</span>
          <button className="drawer-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="drawer-nav">
          {VIEWS.map(v => v.href ? (
            <a
              key={v.id}
              className="drawer-item"
              href={v.href}
              onClick={() => setOpen(false)}
            >
              {v.label}
            </a>
          ) : (
            <button
              key={v.id}
              className={`drawer-item${view === v.id ? ' active' : ''}`}
              onClick={() => { onSetView(v.id); setOpen(false); }}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

export default function App() {
  const [view, setView] = useState('analyzer');
  const [ipPos, setIpPos] = useState("LP");
  const [oopPos, setOopPos] = useState("BB");
  const [potType, setPotType] = useState("srp");
  const [playerType, setPlayerType] = useState("reg");
  const [hero, setHero] = useState("LP");
  const [chips, setChips] = useState([]);

  const matchup = `${ipPos.toLowerCase()}_${oopPos.toLowerCase()}_${potType}`;
  if (!MATCHUPS.find(x => x.id === matchup)) {
    MATCHUPS.push({
      id: matchup,
      label: `${ipPos} vs ${oopPos}`,
      ip: ipPos, oop: oopPos,
      desc: POT_TYPES.find(p => p.id === potType).full,
    });
  } else {
    const rec = MATCHUPS.find(x => x.id === matchup);
    rec.ip = ipPos; rec.oop = oopPos;
  }

  const [line, setLine] = useState([]);
  const [board, setBoard] = useState(DEFAULT_BOARD);

  const autoFilters = useMemo(() => deriveAutoFilters(board), [board]);
  const filters = useMemo(() => ({ texture: autoFilters.map(f => f.id), pool: [] }), [autoFilters]);

  const timelineRef = useRef(null);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [spotData, setSpotData] = useState(undefined);
  const [raiseSpotData, setRaiseSpotData] = useState(undefined);
  const [fetchSeq, setFetchSeq] = useState(0);

  const nonMarkerLine = line.filter(a => !a.marker);
  const perspective = hero === ipPos ? 'ip' : 'oop';
  const queryLine = deriveQueryLine(nonMarkerLine, hero);
  const matchupKey = matchupToKey(oopPos, ipPos, potType, playerType, perspective);
  const lastNonMarkerAction = nonMarkerLine.length > 0 ? nonMarkerLine[nonMarkerLine.length - 1].action : null;
  const lastNonMarkerActor = nonMarkerLine.length > 0 ? nonMarkerLine[nonMarkerLine.length - 1].actor : null;
  const isFacing = lastNonMarkerAction === "bet" || lastNonMarkerAction === "raise";

  // When facing, probe-size data (catchVevPct) lives in the villain's perspective file on
  // the bet rows — not in hero's file. Derive villain's matchup key and query line.
  const villainPos = hero === ipPos ? oopPos : ipPos;
  const villainQueryLine = deriveQueryLine(nonMarkerLine, villainPos);
  const villainMatchupKey = matchupToKey(oopPos, ipPos, potType, playerType, hero === ipPos ? 'oop' : 'ip');

  // True when villain made the last bet/raise (hero is the one facing).
  // False when hero raised — in that case villain faces us, so data lives in hero's IP file.
  const villainIsAggressor = isFacing && lastNonMarkerActor === villainPos;
  const heroIsAggressor    = isFacing && lastNonMarkerActor === hero;

  // Speculative routing when there's no bet outstanding — fetch the *would-be
  // bet* file so bluff-EV data is visible without committing to an action.
  // Two ways to land on a bet/check frontier:
  //   1. The opponent just checked, next-to-act is on bet/check decision.
  //   2. A call ended the street, next-to-act is OOP on the new street.
  // The "next-to-act" is hero or villain depending on perspective.
  const heroIsOop = hero === oopPos;
  const heroOnCheckBetFrontier =
    (lastNonMarkerAction === 'check' && lastNonMarkerActor !== hero) ||
    (lastNonMarkerAction === 'call'  && heroIsOop);
  const villainOnCheckBetFrontier =
    (lastNonMarkerAction === 'check' && lastNonMarkerActor === hero) ||
    (lastNonMarkerAction === 'call'  && !heroIsOop);

  const speculativeLine = heroOnCheckBetFrontier
    ? (queryLine ? queryLine + '-B' : 'B')
    : queryLine;
  const villainSpeculativeLine = villainOnCheckBetFrontier
    ? (villainQueryLine ? villainQueryLine + '-B' : 'B')
    : villainQueryLine;

  // Single source of truth for the line we'll fetch. Empty → nothing to render.
  const effectiveFetchLine = villainIsAggressor
    ? villainQueryLine
    : (villainOnCheckBetFrontier ? villainSpeculativeLine : speculativeLine);

  useEffect(() => {
    if (!isValidCombo(ipPos, oopPos, potType)) {
      setOopPos(getOopOptions(ipPos, potType)[0].id);
    }
  }, [ipPos, potType]);

  useEffect(() => {
    // OOP is PFR when: BvB SRP (SB opened) or 3bp with Blinds OOP (blind 3-bet).
    const oopIsPfr = (ipPos === 'BB' && potType === 'srp') || (potType === '3bp' && oopPos === 'Blinds');
    if (oopIsPfr) {
      setHero(oopPos);
    } else if (hero !== ipPos && hero !== oopPos) {
      setHero(ipPos);
    }
  }, [ipPos, oopPos, potType]);

  useEffect(() => {
    if (!effectiveFetchLine) {
      setSpotData(undefined);
      setRaiseSpotData(undefined);
      return;
    }
    let cancelled = false;
    setSpotData(undefined);
    setRaiseSpotData(undefined);

    // When villain bet/raised (hero is facing): use villain's file.
    // When hero raised (villain is facing): use hero's file — raise data lives in hero's IP file.
    // When the line just had a check, we're speculating about the next bet —
    // route to whichever side is on the bet/check frontier.
    const fetchKey = (villainIsAggressor || villainOnCheckBetFrontier) ? villainMatchupKey : matchupKey;
    const fetchLine = effectiveFetchLine;
    // Try the speculative line first, then deeper extensions. Don't fall back to
    // the *upstream* (non-speculative) line — its nextActions are semantically
    // different (next-street actions, not response-to-bet), and normalizeNext's
    // suffix-based key matching would surface misleading "fold" rates.
    const candidates = [fetchLine, ...['B', 'X', 'C', 'F', 'R'].map(s => `${fetchLine}-${s}`)];

    async function tryInOrder() {
      for (const candidate of candidates) {
        const r = await fetch(`/api/data?matchup=${encodeURIComponent(fetchKey)}&line=${encodeURIComponent(candidate)}`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setSpotData(Array.isArray(d?.data) ? d.data : null);
          return;
        }
      }
      if (!cancelled) setSpotData(null);
    }

    async function fetchRaiseData() {
      // bluffVev on a fold row = the *other* player's raise EV. So route to the
      // file of whoever might raise next:
      //   hero facing villain's bet   → villain's fold file → hero's raise EV
      //   villain facing hero's bet   → hero's fold file    → villain's raise EV
      //   speculative bets follow the same pattern, swapping queryLine for the
      //   speculative '…-B' line so the fold sits under the hypothetical bet.
      const heroSide = heroIsAggressor || heroOnCheckBetFrontier;
      const heroFoldBase    = heroOnCheckBetFrontier    ? speculativeLine        : queryLine;
      const villainFoldBase = villainOnCheckBetFrontier ? villainSpeculativeLine : villainQueryLine;
      const foldBase       = heroSide ? heroFoldBase    : villainFoldBase;
      const foldMatchupKey = heroSide ? matchupKey      : villainMatchupKey;
      const foldKey = foldBase + 'F';
      const r = await fetch(`/api/data?matchup=${encodeURIComponent(foldMatchupKey)}&line=${encodeURIComponent(foldKey)}`);
      if (r.ok) {
        const d = await r.json();
        if (!cancelled) setRaiseSpotData(Array.isArray(d?.data) ? d.data : null);
      } else {
        if (!cancelled) setRaiseSpotData(null);
      }
    }

    tryInOrder().catch(() => { if (!cancelled) setSpotData(null); });
    fetchRaiseData().catch(() => { if (!cancelled) setRaiseSpotData(null); });
    return () => { cancelled = true; };
  }, [matchupKey, effectiveFetchLine, villainMatchupKey, villainQueryLine, villainSpeculativeLine, speculativeLine, villainIsAggressor, heroIsAggressor, heroOnCheckBetFrontier, villainOnCheckBetFrontier, queryLine, fetchSeq]);

  // Read state from URL on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('ip')) setIpPos(p.get('ip'));
    if (p.get('oop')) setOopPos(p.get('oop'));
    if (p.get('pot')) setPotType(p.get('pot'));
    if (p.get('player')) setPlayerType(SHOW_FISH ? p.get('player') : 'reg');
    if (p.get('hero')) setHero(p.get('hero'));
    if (p.get('line')) setChips(p.get('line').split(''));
    if (p.get('board')) setBoard(parseBoard(p.get('board')));
  }, []);

  // Write state to URL whenever it changes
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('ip', ipPos);
    p.set('oop', oopPos);
    p.set('pot', potType);
    p.set('player', playerType);
    p.set('hero', hero);
    if (chips.length) p.set('line', chips.join(''));
    const boardStr = serializeBoard(board);
    if (boardStr) p.set('board', boardStr);
    window.history.replaceState(null, '', '?' + p.toString());
  }, [ipPos, oopPos, potType, playerType, hero, chips, board]);

  const handleUploadSuccess = () => setFetchSeq(s => s + 1);

  return (
    <div className="app no-topbar">
      <BurgerMenu view={view} onSetView={setView} />
      <div className="page">
        <section className="setup-card">
          <ConfigBar
            ipPos={ipPos} setIpPos={setIpPos}
            oopPos={oopPos} setOopPos={setOopPos}
            potType={potType} setPotType={setPotType}
            playerType={playerType} setPlayerType={setPlayerType}
            hero={hero} setHero={setHero}
          />
        </section>

        {view === 'explorer' ? (
          <LineExplorer matchupKey={matchupKey} />
        ) : (
          <>
            <section className="line-card">
              <ActionTimeline
                ref={timelineRef}
                line={line} setLine={setLine}
                matchup={matchup} hero={hero}
                board={board} setBoard={setBoard}
                chips={chips} setChips={setChips}
              />
            </section>

            {nonMarkerLine.length === 0 ? (
              <div className="empty-state">
                <div className="es-title">Build an action line</div>
                <div className="es-sub">Pick actions on the timeline above to see population frequencies and EV.</div>
              </div>
            ) : !effectiveFetchLine ? (
              <div className="empty-state">
                <div className="es-title">No data for this spot</div>
              </div>
            ) : (
              <ResultsPane
                line={nonMarkerLine}
                hero={hero}
                matchup={matchup}
                filters={filters}
                board={board}
                setBoard={setBoard}
                spotData={spotData}
                raiseSpotData={raiseSpotData}
                onUpload={() => setUploadOpen(true)}
                onSelectNext={(nextChips) => timelineRef.current?.appendChips(nextChips)}
              />
            )}

            <div className="page-footer">
              <button className="ghost-btn" onClick={() => setUploadOpen(true)}>Upload JSON</button>
              <button className="ghost-btn" onClick={() => setCoverageOpen(true)}>Coverage</button>
            </div>
          </>
        )}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Display">
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "balanced", label: "Balanced" },
              { value: "spacious", label: "Spacious" },
            ]}
          />
          <TweakToggle
            label="Show opponent card"
            value={tweaks.showOpponentCard}
            onChange={(v) => setTweak("showOpponentCard", v)}
          />
        </TweakSection>
      </TweaksPanel>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {coverageOpen && (
        <CoverageModal onClose={() => setCoverageOpen(false)} />
      )}
    </div>
  );
}
