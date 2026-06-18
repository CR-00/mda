import { useState, useEffect, useMemo, useRef } from 'react';
import ConfigBar, { BoardCard, POT_TYPES, isValidCombo, getOopOptions } from './ConfigBar';
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

const NAV_VIEWS = [
  { id: 'analyzer', label: 'Analyzer' },
  { id: 'explorer', label: 'Line Explorer' },
  { id: 'spots', label: 'Spot Browser', href: '/spots', needs: 'spots' },
  { id: 'exploits', label: 'Exploits', href: '/exploits', needs: 'exploits' },
  { id: 'summary', label: 'Strategy Summary', href: '/summary', needs: 'summary' },
];

function NavMenu({ view, onSetView }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // null = unknown; don't disable until known
  const current = NAV_VIEWS.find(v => v.id === view) ?? NAV_VIEWS[0];

  // Which strategy-backed pages have data uploaded — drives disabling links that
  // would otherwise 404.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/strategy-status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setStatus(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!e.target.closest('.nav-menu')) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDisabled = (v) => !!v.needs && status != null && status[v.needs] === false;

  return (
    <div className="nav-menu">
      <button
        className={`nav-menu-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Section navigation"
        aria-expanded={open}
      >
        {current.label}<span className="nav-caret">▾</span>
      </button>
      {open && (
        <div className="nav-menu-list">
          {NAV_VIEWS.map(v => {
            if (isDisabled(v)) {
              return (
                <button key={v.id} className="nav-menu-item disabled" disabled title="No data uploaded">
                  {v.label}
                </button>
              );
            }
            return v.href ? (
              <a key={v.id} className="nav-menu-item" href={v.href}>{v.label}</a>
            ) : (
              <button
                key={v.id}
                className={`nav-menu-item${view === v.id ? ' active' : ''}`}
                onClick={() => { onSetView(v.id); setOpen(false); }}
              >{v.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Read deep-link state from the URL once, for the initial render. App is a
// client-only component (ssr:false), so window is available here. Doing this in
// the state initializers — rather than a mount effect — avoids racing the
// URL-writing effect, which would otherwise clobber the params back to defaults
// (especially under React StrictMode's double-invoked effects).
function readInitialState() {
  const d = { ipPos: "LP", oopPos: "BB", potType: "srp", playerType: "reg", hero: "LP", chips: [], board: DEFAULT_BOARD };
  if (typeof window === 'undefined') return d;
  const p = new URLSearchParams(window.location.search);
  if (p.get('ip')) d.ipPos = p.get('ip');
  if (p.get('oop')) d.oopPos = p.get('oop');
  if (p.get('pot')) d.potType = p.get('pot');
  if (p.get('player')) d.playerType = SHOW_FISH ? p.get('player') : 'reg';
  if (p.get('hero')) d.hero = p.get('hero');
  if (p.get('line')) d.chips = p.get('line').split('');
  if (p.get('board')) d.board = parseBoard(p.get('board'));
  return d;
}

export default function App() {
  const initial = useRef();
  if (!initial.current) initial.current = readInitialState();

  const [view, setView] = useState('analyzer');
  const [ipPos, setIpPos] = useState(initial.current.ipPos);
  const [oopPos, setOopPos] = useState(initial.current.oopPos);
  const [potType, setPotType] = useState(initial.current.potType);
  const [playerType, setPlayerType] = useState(initial.current.playerType);
  const [hero, setHero] = useState(initial.current.hero);
  const [chips, setChips] = useState(initial.current.chips);

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
  const [board, setBoard] = useState(initial.current.board);

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
  // Three ways to land on a bet/check frontier:
  //   1. The root of the flop, before any action — OOP is first to act.
  //   2. The opponent just checked, next-to-act is on bet/check decision.
  //   3. A call ended the street, next-to-act is OOP on the new street.
  // The "next-to-act" is hero or villain depending on perspective.
  const atRoot = nonMarkerLine.length === 0;
  const heroIsOop = hero === oopPos;
  const heroOnCheckBetFrontier =
    (atRoot && heroIsOop) ||
    (lastNonMarkerAction === 'check' && lastNonMarkerActor !== hero) ||
    (lastNonMarkerAction === 'call'  && heroIsOop);
  const villainOnCheckBetFrontier =
    (atRoot && !heroIsOop) ||
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
      <div className="page">
        <ConfigBar
          ipPos={ipPos} setIpPos={setIpPos}
          oopPos={oopPos} setOopPos={setOopPos}
          potType={potType} setPotType={setPotType}
          playerType={playerType} setPlayerType={setPlayerType}
          nav={<NavMenu view={view} onSetView={setView} />}
        />

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

            <BoardCard board={board} setBoard={setBoard} />

            {!effectiveFetchLine ? (
              nonMarkerLine.length === 0 ? (
                <div className="empty-state">
                  <div className="es-title">Build an action line</div>
                  <div className="es-sub">Pick actions on the timeline above to see population frequencies and EV.</div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="es-title">No data for this spot</div>
                </div>
              )
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
