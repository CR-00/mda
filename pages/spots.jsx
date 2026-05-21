import { useEffect, useMemo, useState } from 'react';

const BUCKET = 'BB_vs_LP_srp_reg';
const PERSPECTIVES = [
  { id: 'ip',  label: 'IP (LP open)' },
  { id: 'oop', label: 'OOP (BB call)' },
];
const STREETS = [
  { id: 'flop',  label: 'Flop' },
  { id: 'turn',  label: 'Turn' },
  { id: 'river', label: 'River' },
  { id: 'defense', label: 'Defending' },
];

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(d);
}

function evClass(ev) {
  if (ev == null) return '';
  if (ev > 0.5)  return 'pos';
  if (ev < -0.5) return 'neg';
  return '';
}

function actionPill(rec) {
  if (!rec) return <span className="sp-pill sp-pill-na">no data</span>;
  if (rec.verb === 'check / give up') return <span className="sp-pill sp-pill-check">check / give up</span>;
  if (rec.type === 'bluff') return <span className="sp-pill sp-pill-bluff">bluff</span>;
  return <span className="sp-pill sp-pill-value">value bet</span>;
}

function multistreetBadge(spot) {
  const ms = spot.multistreet;
  if (!ms) return null;
  if (ms.recommended_strategy) {
    const label = { triple_barrel: '3-barrel +EV', double_barrel: '2-barrel +EV', single_barrel: 'single only' }[ms.recommended_strategy] || ms.recommended_strategy;
    if (ms.recommended_strategy === 'no_bet') return null;
    return (
      <span className="sp-pill sp-pill-ms" title={`barrel EV ${fmt(ms.recommended_ev_bb)} bb · sizings ${JSON.stringify(ms.sizings)}`}>
        {label} (+{fmt(ms.recommended_ev_bb)} bb)
      </span>
    );
  }
  // float scenario
  if (ms.turn_lead_bluff && ms.recommended) {
    if (ms.recommended === 'check') return null;
    return (
      <span className="sp-pill sp-pill-ms" title={`turn-lead bluff EV ${fmt(ms.turn_lead_bluff.ev_bb)} bb at ${ms.turn_lead_bluff.size}%`}>
        float → {ms.recommended.replace('lead_', '')} (+{fmt((ms.turn_lead_bluff.ev_bb + ms.turn_lead_value.ev_bb) / 2)} bb)
      </span>
    );
  }
  return null;
}

function ConfDot({ confidence }) {
  return <span className={`sp-conf sp-conf-${confidence}`} title={`confidence: ${confidence}`}>●</span>;
}

function SpotCard({ spot }) {
  const sizes = useMemo(() => Object.keys(spot.per_size || {}), [spot]);
  const initialSize = spot.recommendation?.best_size && sizes.includes(spot.recommendation.best_size)
    ? spot.recommendation.best_size
    : sizes[0];
  const [size, setSize] = useState(initialSize);
  const row = spot.per_size?.[size];

  const bluffEv = row ? (row.bluff_ev_bb_incremental ?? row.bluff_ev_bb) : null;
  const valueEv = row ? (row.value_ev_bb_incremental ?? row.value_ev_bb) : null;

  return (
    <div className="sp-card">
      <div className="sp-card-head">
        <div className="sp-line">
          <code className="sp-code">{spot.line}</code>
          <span className="sp-name">{spot.label}</span>
        </div>
        <div className="sp-head-right">
          {actionPill(spot.recommendation)}
          {multistreetBadge(spot)}
          <ConfDot confidence={spot.confidence} />
        </div>
      </div>

      <div className="sp-card-body">
        <div className="sp-rec">
          {spot.recommendation?.best_size && (
            <span className="sp-best">best size: <b>{spot.recommendation.best_size}%</b> → <b className={evClass(spot.recommendation.best_ev_bb)}>{fmt(spot.recommendation.best_ev_bb)} bb</b></span>
          )}
          <span className="sp-meta">pot {fmt(spot.pot_bb, 1)} bb · n={spot.sample_size?.toLocaleString()}</span>
        </div>

        <div className="sp-size-row">
          <label>size:&nbsp;
            <select value={size} onChange={e => setSize(e.target.value)}>
              {sizes.map(s => <option key={s} value={s}>{spot.per_size[s].label || `${s}%`}</option>)}
            </select>
          </label>
          {row && (
            <div className="sp-stats">
              <span className="sp-stat">fold <b>{(row.bf * 100).toFixed(0)}%</b></span>
              <span className="sp-stat">call <b>{(row.bc * 100).toFixed(0)}%</b></span>
              <span className="sp-stat">raise <b>{(row.br * 100).toFixed(0)}%</b></span>
              <span className="sp-stat sp-stat-edge">
                {row.overfold_pp > 0
                  ? <span className="pos">+{row.overfold_pp.toFixed(1)}pp overfold</span>
                  : <span className="neg">{row.overfold_pp.toFixed(1)}pp under-fold</span>}
              </span>
              <span className="sp-stat">bluff EV <b className={evClass(bluffEv)}>{fmt(bluffEv)} bb</b></span>
              <span className="sp-stat">value EV <b className={evClass(valueEv)}>{fmt(valueEv)} bb</b></span>
              <span className="sp-stat sp-stat-n">n={row.response_sample?.toLocaleString?.() ?? row.response_sample}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DefenseCard({ def }) {
  const sizes = def.per_size ?? [];
  const initial = sizes[sizes.length - 1]?.bucket;
  const [size, setSize] = useState(initial);
  const row = sizes.find(s => s.bucket === size);

  const verdict = (ev) => {
    if (ev == null) return { word: '—', cls: '' };
    if (ev >  1)  return { word: 'CALL',   cls: 'pos' };
    if (ev > -1)  return { word: 'thin',   cls: '' };
    return            { word: 'FOLD',   cls: 'neg' };
  };
  const v = row ? verdict(row.call_ev_bb) : null;

  return (
    <div className="sp-card">
      <div className="sp-card-head">
        <div className="sp-line">
          <code className="sp-code">{def.mirror_line}</code>
          <span className="sp-name">{def.label}</span>
        </div>
        <div className="sp-head-right">
          {v && <span className={`sp-pill sp-pill-${v.cls === 'pos' ? 'value' : v.cls === 'neg' ? 'fold' : 'check'}`}>{v.word}</span>}
        </div>
      </div>
      <div className="sp-card-body">
        <div className="sp-rec">
          <span className="sp-meta">pot {fmt(def.pot_bb, 1)} bb · n={def.sample_size?.toLocaleString()}</span>
        </div>
        <div className="sp-size-row">
          <label>villain's size:&nbsp;
            <select value={size} onChange={e => setSize(e.target.value)}>
              {sizes.map(s => <option key={s.bucket} value={s.bucket}>{s.bucket}% (avg {(s.pctPot * 100).toFixed(0)}%)</option>)}
            </select>
          </label>
          {row && (
            <div className="sp-stats">
              <span className="sp-stat">call EV <b className={evClass(row.call_ev_bb)}>{fmt(row.call_ev_bb)} bb</b></span>
              <span className="sp-stat">fold EV <b>0.00 bb</b></span>
              <span className="sp-stat sp-stat-n">n={row.sample?.toLocaleString()}</span>
              <ConfDot confidence={row.confidence} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpotsPage() {
  const [perspective, setPerspective] = useState('ip');
  const [street, setStreet] = useState('flop');
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDoc(null); setError(null);
    fetch(`/api/spots?bucket=${BUCKET}&perspective=${perspective}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setDoc)
      .catch(e => setError(String(e)));
  }, [perspective]);

  const spotsByStreet = useMemo(() => {
    const groups = { flop: [], turn: [], river: [] };
    for (const s of (doc?.spots ?? [])) {
      if (groups[s.street]) groups[s.street].push(s);
    }
    return groups;
  }, [doc]);

  const visible = street === 'defense' ? null : spotsByStreet[street] ?? [];

  return (
    <div className="sp-page">
      <header className="sp-head">
        <div className="sp-title"><span className="sp-mark">◎</span> Spot Browser <span className="sp-bucket">{BUCKET}</span></div>
        <a className="sp-home" href="/">← analyzer</a>
      </header>

      <div className="sp-tabs">
        {PERSPECTIVES.map(p => (
          <button
            key={p.id}
            className={`sp-tab${perspective === p.id ? ' active' : ''}`}
            onClick={() => setPerspective(p.id)}
          >{p.label}</button>
        ))}
      </div>

      <div className="sp-subtabs">
        {STREETS.map(s => (
          <button
            key={s.id}
            className={`sp-subtab${street === s.id ? ' active' : ''}`}
            onClick={() => setStreet(s.id)}
          >{s.label} {s.id !== 'defense' && doc && <em className="sp-count">{spotsByStreet[s.id]?.length ?? 0}</em>}
            {s.id === 'defense' && doc && <em className="sp-count">{doc.defenses?.length ?? 0}</em>}
          </button>
        ))}
      </div>

      {error && <div className="sp-error">{error}</div>}
      {!doc && !error && <div className="sp-loading">loading…</div>}

      <div className="sp-list">
        {street === 'defense'
          ? (doc?.defenses ?? []).map(d => <DefenseCard key={d.mirror_line} def={d} />)
          : (visible ?? []).map(s => <SpotCard key={s.line} spot={s} />)}
        {doc && street !== 'defense' && visible?.length === 0 && (
          <div className="sp-empty">No {street} spots with data for this perspective.</div>
        )}
      </div>
    </div>
  );
}
