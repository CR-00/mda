import { useEffect, useMemo, useRef, useState } from 'react';
import { STRATEGY_BUCKETS, DEFAULT_BUCKET, bucketMeta } from '../lib/strategyBuckets';
import { buildSpotPool, emptyStats, applyRep } from '../lib/trainer';
import {
  buildNodeIndex, startHand, currentDecision, act, isTerminal, handResult, runHandBatch,
} from '../lib/handEngine';

// --- tiny display helpers (kept in parity with pages/spots.jsx) ---
function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(d);
}
function signed(n, d = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(d);
}
function evClass(ev) {
  if (ev == null) return '';
  if (ev > 0.5) return 'pos';
  if (ev < -0.5) return 'neg';
  return '';
}
function chipClass(n) {
  if (n == null || Math.abs(n) < 1e-9) return '';
  return n > 0 ? 'pos' : 'neg';
}

const SEATS = [
  { id: 'alternate', label: 'Alternate seats' },
  { id: 'aggressor', label: 'Aggressor' },
  { id: 'defender', label: 'Defender' },
];
const CATEGORY_LABEL = { value: 'VALUE', bluff: 'BLUFF', bluffcatcher: 'BLUFFCATCHER' };
const STREET_LABEL = { flop: 'FLOP', turn: 'TURN', river: 'RIVER' };
const AUTO_DELAY_MS = 2600;   // dwell on the finished-hand reveal
const AUTO_STEP_MS = 650;     // per-decision cadence while auto-playing a hand
const AUTO_HAND_MS = 900;     // pause between hands while auto-playing

// Tracker-style colours: net = green, EV = orange, showdown = blue, non-sd = red.
const LINE_COLORS = { net: 'var(--pos)', ev: '#e8a33d', sd: '#5b9bd5', nsd: 'var(--neg)' };

// Cumulative winnings graph (net / EV / showdown / non-showdown), dependency-free SVG.
function WinningsGraph({ history, stats }) {
  const W = 720, H = 220, padL = 46, padR = 14, padT = 14, padB = 22;

  const num = v => (Number.isFinite(v) ? v : 0);
  const pts = [{ net: 0, ev: 0, sd: 0, nsd: 0 }];
  let net = 0, ev = 0, sd = 0, nsd = 0;
  for (const h of history) {
    const r = num(h.realized);
    net += r;
    ev += num(h.evRealized);
    if (h.showdown) sd += r; else nsd += r;
    pts.push({ net, ev, sd, nsd });
  }
  const n = pts.length;

  let min = 0, max = 0;
  for (const p of pts) {
    if (p.net < min) min = p.net; if (p.net > max) max = p.net;
    if (p.ev < min) min = p.ev;   if (p.ev > max) max = p.ev;
    if (p.sd < min) min = p.sd;   if (p.sd > max) max = p.sd;
    if (p.nsd < min) min = p.nsd; if (p.nsd > max) max = p.nsd;
  }
  if (min === max) { min -= 1; max += 1; }
  const padv = (max - min) * 0.08;
  min -= padv; max += padv;

  const x = i => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const step = n > 1200 ? Math.ceil(n / 1200) : 1;
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const path = key => idx.map((i, j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i][key]).toFixed(1)}`).join(' ');
  const y0 = y(0);

  const bb100 = stats.reps ? (stats.realized / stats.reps) * 100 : 0;
  const evBb100 = stats.reps ? (stats.evReal / stats.reps) * 100 : 0;

  return (
    <div className="tr-graph">
      <div className="tr-winrate">
        <b className={chipClass(bb100)}>{signed(bb100, 1)}</b> bb/100
        <small>EV {signed(evBb100, 1)} bb/100</small>
      </div>
      <div className="tr-graph-legend">
        <span className="tr-leg" style={{ '--c': LINE_COLORS.net }}>net <b className={chipClass(stats.realized)}>{signed(stats.realized, 1)} bb</b></span>
        <span className="tr-leg" style={{ '--c': LINE_COLORS.ev }}>EV <b>{signed(stats.evReal, 1)}</b></span>
        <span className="tr-leg" style={{ '--c': LINE_COLORS.sd }}>showdown <b>{signed(stats.showdown, 1)}</b></span>
        <span className="tr-leg" style={{ '--c': LINE_COLORS.nsd }}>non-showdown <b>{signed(stats.nonShowdown, 1)}</b></span>
        <span className="tr-leg-stat">{stats.reps} hands · {(stats.accuracy * 100).toFixed(0)}% EV-correct · {(stats.evEfficiency * 100).toFixed(0)}% EV captured</span>
      </div>
      <svg className="tr-graph-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="winnings graph">
        <line x1={padL} x2={W - padR} y1={y0} y2={y0} className="tr-axis-zero" />
        <text x={padL - 6} y={y(max) + 4} className="tr-axis-lbl" textAnchor="end">{signed(max, 0)}</text>
        <text x={padL - 6} y={y0 + 4} className="tr-axis-lbl" textAnchor="end">0</text>
        <text x={padL - 6} y={y(min) + 4} className="tr-axis-lbl" textAnchor="end">{signed(min, 0)}</text>
        {history.length === 0 ? (
          <text x={W / 2} y={H / 2} className="tr-axis-lbl" textAnchor="middle">play a hand to start the graph</text>
        ) : (
          <>
            <path d={path('nsd')} fill="none" stroke={LINE_COLORS.nsd} strokeWidth="1.5" />
            <path d={path('sd')} fill="none" stroke={LINE_COLORS.sd} strokeWidth="1.5" />
            <path d={path('ev')} fill="none" stroke={LINE_COLORS.ev} strokeWidth="1.5" strokeDasharray="4 3" />
            <path d={path('net')} fill="none" stroke={LINE_COLORS.net} strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  );
}

// --- table pieces ---------------------------------------------------------

function HandToken({ category }) {
  if (!category) return <span className="tr-hand tr-hand-unknown">?</span>;
  return <span className={`tr-hand tr-hand-${category}`}>{CATEGORY_LABEL[category]}</span>;
}

function Seat({ who, sub, hand, badge, chip, active }) {
  return (
    <div className={`tr-seat${active ? ' active' : ''}`}>
      {chip != null && <div className={`tr-bet ${chipClass(chip)}`}>{signed(chip, 1)} bb</div>}
      <HandToken category={hand} />
      <div className="tr-seat-name">{who}{badge && <span className="tr-badge">{badge}</span>}</div>
      {sub && <div className="tr-seat-sub">{sub}</div>}
    </div>
  );
}

// The street run-out strip: one cell per street, showing the card + what
// happened, with the live street highlighted.
function RunoutStrip({ hand, decision }) {
  const cells = [{ street: 'flop' }];
  for (const r of hand.runout) cells.push({ street: r.street, card: r.card, note: r.note });
  const seen = new Set(cells.map(c => c.street));
  // ensure flop card if engine recorded one
  const flopCard = hand.runout.find(r => r.street === 'flop');
  if (flopCard) cells[0].card = flopCard.card;

  const liveStreet = decision?.street;
  return (
    <div className="tr-runout">
      {['flop', 'turn', 'river'].map(st => {
        const cell = cells.find(c => c.street === st);
        const reached = seen.has(st) || st === liveStreet || st === 'flop';
        const live = st === liveStreet;
        return (
          <div key={st} className={`tr-ro${live ? ' live' : ''}${reached ? '' : ' dim'}`}>
            <em>{STREET_LABEL[st]}</em>
            <span className="tr-ro-card">{cell?.card || (reached ? '·' : '—')}</span>
            {cell?.note && <small>{cell.note}</small>}
          </div>
        );
      })}
    </div>
  );
}

// The per-decision replay shown once the hand is over.
function StepRow({ step }) {
  const verb = step.kind === 'defender'
    ? (step.choiceKey === 'fold' ? 'fold' : 'call')
    : (step.choiceKey === 'check' ? 'check' : `bet ${step.choiceKey}%`);
  const bot = step.kind === 'defender'
    ? (step.river ? `bot shows ${step.botHand || '—'}` : 'continue')
    : ({ fold: 'bot folds', call: 'bot calls', raise: 'bot raises', check: '—' }[step.botAction] || '');
  return (
    <div className={`tr-step-row${step.correct ? '' : ' off'}`}>
      <span className="tr-step-st">{STREET_LABEL[step.street]}</span>
      <span className="tr-step-cat"><HandToken category={step.category} /></span>
      <span className="tr-step-act">you {verb} {step.correct ? <i className="ok">✓</i> : <i className="bad">✗</i>}</span>
      <span className="tr-step-bot">{bot}</span>
      <span className={`tr-step-ev ${chipClass(step.realized)}`}>{step.realized ? signed(step.realized, 1) + ' bb' : ''}</span>
    </div>
  );
}

function heroPosLabel(hand) {
  if (!hand?.bucket) return hand?.perspective?.toUpperCase() || '';
  const meta = bucketMeta(hand.bucket);
  return hand.perspective === 'ip' ? meta.ip : meta.oop;
}
function villainPosLabel(hand) {
  if (!hand?.bucket) return '';
  const meta = bucketMeta(hand.bucket);
  return hand.perspective === 'ip' ? meta.oop : meta.ip;
}

export default function TrainerPage() {
  const [bucket, setBucket] = useState(DEFAULT_BUCKET);
  const [seat, setSeat] = useState('alternate');

  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);

  const [hand, setHand] = useState(null);       // live hand state from the engine
  const [done, setDone] = useState(null);       // handResult once terminal (null = in progress)
  const [stats, setStats] = useState(emptyStats);
  const [history, setHistory] = useState([]);
  const [autoNext, setAutoNext] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  // keep the latest hand in a ref so the autoplay timer reads fresh state
  const handRef = useRef(null); handRef.current = hand;

  // Fetch both perspectives, build the node index, reset the session.
  useEffect(() => {
    let cancelled = false;
    setIndex(null); setError(null); setHand(null); setDone(null);
    setStats(emptyStats()); setHistory([]); setAutoPlay(false);
    (async () => {
      try {
        const docs = await Promise.all(['ip', 'oop'].map(async p => {
          const r = await fetch(`/api/spots?bucket=${encodeURIComponent(bucket)}&perspective=${p}`);
          return r.ok ? r.json() : null;
        }));
        if (cancelled) return;
        if (!docs.some(Boolean)) { setError('No strategy library built for this bucket.'); setIndex(null); return; }
        setIndex(buildNodeIndex(buildSpotPool(docs)));
      } catch (e) {
        if (!cancelled) { setError(String(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, [bucket]);

  function newHand() {
    if (!index) return;
    let h = startHand(index, { seat });
    // skip immediately-terminal starts (missing data for a seat/perspective)
    let guard = 0;
    while (isTerminal(h) && guard++ < 8) h = startHand(index, { seat });
    setHand(h);
    setDone(null);
  }

  // Start a hand whenever the index or seat changes.
  useEffect(() => {
    if (index) newHand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, seat]);

  const decision = hand && !done ? currentDecision(hand) : null;

  function finalize(finishedHand) {
    const r = handResult(finishedHand);
    setDone(r);
    setStats(s => applyRep(s, r));
    setHistory(hs => [...hs, { realized: r.realized ?? 0, evRealized: r.evRealized ?? 0, showdown: !!r.showdown }]);
  }

  function choose(key) {
    if (done || !hand) return;
    const { hand: next } = act(index, hand, key);
    setHand(next);
    if (isTerminal(next)) finalize(next);
  }

  function fastForward(nHands) {
    if (!index) return;
    const results = runHandBatch(index, nHands, { seat, optimal: true });
    setStats(s => results.reduce(applyRep, s));
    setHistory(hs => [...hs, ...results.map(r => ({
      realized: r.realized ?? 0, evRealized: r.evRealized ?? 0, showdown: !!r.showdown,
    }))]);
  }

  // Auto-advance to the next hand after the reveal (manual auto-next).
  useEffect(() => {
    if (!autoNext || autoPlay || !done) return;
    const t = setTimeout(newHand, AUTO_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNext, autoPlay, done]);

  // Auto-play: step optimally through the live hand, then deal the next one.
  useEffect(() => {
    if (!autoPlay || !hand) return;
    if (!done) {
      const dec = currentDecision(hand);
      if (!dec) return;
      const best = dec.choices.reduce((b, c) => (c.ev > b.ev ? c : b), dec.choices[0]);
      const t = setTimeout(() => choose(best.key), AUTO_STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(newHand, AUTO_HAND_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, hand, done]);

  const isDefender = hand?.seat === 'defender';
  const heroCat = done ? (hand.steps[hand.steps.length - 1]?.category ?? hand.category) : hand?.category;

  return (
    <div className="sp-page tr-page">
      <header className="sp-head">
        <div className="sp-title"><span className="sp-mark">◎</span> MDA Trainer</div>
        <div className="sp-head-right">
          <select className="sp-bucket-select" value={bucket} onChange={e => setBucket(e.target.value)} title="strategy bucket">
            {STRATEGY_BUCKETS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <a className="sp-home" href="/">← analyzer</a>
        </div>
      </header>

      <WinningsGraph history={history} stats={stats} />

      <div className="tr-filters">
        <label>seat:&nbsp;
          <select value={seat} onChange={e => setSeat(e.target.value)} disabled={autoPlay}>
            {SEATS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="tr-check">
          <input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)} disabled={autoPlay} />
          &nbsp;auto-next
        </label>
        <button type="button" className={`tr-autoplay${autoPlay ? ' on' : ''}`} onClick={() => setAutoPlay(p => !p)}>
          {autoPlay ? '⏸ stop auto-play' : '▶ auto-play (optimal)'}
        </button>
        <span className="tr-ff">
          fast-forward:
          <button type="button" onClick={() => fastForward(100)}>+100</button>
          <button type="button" onClick={() => fastForward(1000)}>+1k</button>
          <button type="button" onClick={() => fastForward(10000)}>+10k</button>
        </span>
      </div>

      {error && <div className="sp-error">{error}</div>}
      {!index && !error && <div className="sp-loading">loading…</div>}

      {hand && (
        <>
          <div className="tr-table">
            <div className="tr-felt">
              <Seat
                who={villainPosLabel(hand)}
                badge="BOT"
                sub={isDefender
                  ? (done ? null : (decision?.river ? `bets ${decision.spot.sizeBucket}% pot` : 'barrels'))
                  : (done ? (hand.status === 'folded_out' ? 'folded' : hand.status === 'showdown' ? 'called down' : '—') : 'defends')}
                hand={isDefender && done ? hand.botHand : null}
                active={!done}
              />

              <div className="tr-center">
                <div className="tr-pot">pot {fmt(hand.pot, 1)} bb</div>
                <RunoutStrip hand={hand} decision={decision} />
                {decision && (
                  <div className="tr-line-title">
                    {isDefender
                      ? (decision.river ? 'River — fold or call?' : `${STREET_LABEL[decision.street]} — bot bets, continue?`)
                      : `${STREET_LABEL[decision.street]} — your move`}
                  </div>
                )}
              </div>

              <Seat
                who={`you (${heroPosLabel(hand)})`}
                badge={hand.seat === 'aggressor' ? 'AGGR' : 'DEF'}
                sub={bucketMeta(hand.bucket).label}
                hand={heroCat}
                active
              />
              <div className="tr-dealer" title="dealer button">D</div>
            </div>
          </div>

          {decision && !done && (
            <div className="tr-actions">
              {decision.choices.map(c => (
                <button
                  key={c.key}
                  className="tr-choice"
                  onClick={() => choose(c.key)}
                  disabled={autoPlay}
                >{c.label}</button>
              ))}
            </div>
          )}

          {done && (
            <div className="tr-reveal">
              <div className="tr-verdict-row">
                <span className={`tr-verdict ${done.correct ? 'pos' : 'neg'}`}>
                  {done.correct ? '✓ Played optimally' : '✗ Off optimal'} · {done.repScore}/100
                  {!done.correct && <> · −{fmt(done.evLost)} bb vs best</>}
                </span>
                <span className={`tr-realized ${chipClass(done.realized)}`}>{signed(done.realized, 1)} bb this hand</span>
              </div>
              {done.correct && done.realized < 0 && (
                <div className="tr-runline">right line, bad run — the EV is what counts.</div>
              )}
              {!done.correct && done.realized > 0 && (
                <div className="tr-runline">it won this time, but it leaked EV long-run.</div>
              )}
              <div className="tr-replay">
                {hand.steps.map((s, i) => <StepRow key={i} step={s} />)}
              </div>
              <button className="tr-next" onClick={newHand}>
                {autoNext ? 'Next now →' : 'Next hand →'}
                {autoNext && <span key={stats.reps} className="tr-next-bar" style={{ animationDuration: `${AUTO_DELAY_MS}ms` }} />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
