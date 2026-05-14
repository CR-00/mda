import { useState, useEffect, useMemo, useRef } from 'react';
import ConfigBar, { POT_TYPES, isValidCombo } from './ConfigBar';
import ActionTimeline from './ActionTimeline';
import ResultsPane from './ResultsPane';
import UploadModal from './UploadModal';
import CoverageModal from './CoverageModal';
import LineExplorer from './LineExplorer';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } from './TweaksPanel';
import { MATCHUPS, FILTERS } from '../lib/data';
import { deriveQueryLine, matchupToKey } from '../lib/spotMatch';

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
          {VIEWS.map(v => (
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
  const [stack, setStack] = useState("100bb");

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
  const [board, setBoard] = useState([
    { rank: "K", suit: "s" },
    { rank: "8", suit: "h" },
    { rank: "4", suit: "d" },
    { rank: "Q", suit: "c" },
    null,
  ]);

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

  useEffect(() => {
    if (!isValidCombo(ipPos, oopPos)) {
      if (ipPos === 'BB') setOopPos('SB');
    }
  }, [ipPos]);

  useEffect(() => {
    if (hero !== ipPos && hero !== oopPos) setHero(ipPos);
  }, [ipPos, oopPos]);

  useEffect(() => {
    if (!queryLine) {
      setSpotData(undefined);
      setRaiseSpotData(undefined);
      return;
    }
    let cancelled = false;
    setSpotData(undefined);
    setRaiseSpotData(undefined);

    const candidates = [queryLine, ...['B', 'X', 'C', 'F', 'R'].map(s => `${queryLine}-${s}`)];

    async function tryInOrder() {
      for (const candidate of candidates) {
        const r = await fetch(`/api/data?matchup=${encodeURIComponent(matchupKey)}&line=${encodeURIComponent(candidate)}`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setSpotData(Array.isArray(d?.data) ? d.data : null);
          return;
        }
      }
      if (!cancelled) setSpotData(null);
    }

    async function fetchRaiseData() {
      const raiseKey = queryLine + 'F';
      const r = await fetch(`/api/data?matchup=${encodeURIComponent(matchupKey)}&line=${encodeURIComponent(raiseKey)}`);
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
  }, [matchupKey, queryLine, fetchSeq]);

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
              />
            </section>

            {nonMarkerLine.length === 0 ? (
              <div className="empty-state">
                <div className="es-title">Build an action line</div>
                <div className="es-sub">Pick actions on the timeline above to see population frequencies and EV.</div>
              </div>
            ) : !queryLine ? (
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
                onSelectNext={(chips) => timelineRef.current?.appendChips(chips)}
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
