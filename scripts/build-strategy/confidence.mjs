// Statistical-confidence layer wrapped around the alpha metric.
//
// Three independent questions, all answered here:
//
//   1. Is the edge real? (P_real, CONF)
//      Beta posterior for fold-based exploits, binary-call variance model
//      for facing-call exploits. P_real = P(true effect crosses break-even).
//
//   2. How tight is the alpha estimate?
//      Propagates SE through alpha = gross − max(0, mirror).
//      Returns alpha_floor = α − 1.65·SE (lower 95% bound, one-sided),
//      plus P(mirror_call_EV > 0) so the gate's softness near zero is visible.
//
//   3. Does it survive multiple-comparison correction?
//      Benjamini-Hochberg FDR at q across the whole P_real vector.
//
// The IMPACT recomputation that uses these lives below in recomputeImpact.

// ─── Stats primitives ────────────────────────────────────────────────────

// Abramowitz & Stegun 7.1.26 — accurate to ~1.5e-7 over the real line.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
                   - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function clip(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

// ─── Bucket → approximate pctPot for MDF reconstruction ──────────────────
//
// The bet-side `sample` is the count of pool responses (folds + calls + raises)
// after the bet, and `edge_pp` = (observed_fold% − MDF_fold%)*100. To recover
// the raw fold count we need MDF_fold%, which depends on actual bet/pot. We
// don't carry pctPot_avg on the exploit row, so use the bucket center as an
// approximation. This is good enough for the P_real direction; the variance
// of the binomial is only weakly dependent on the precise fold% in the
// middle of the [0,1] range.
const BUCKET_CENTER_PCT = {
  '25': 22,    // bucket members [10, 25], roughly 22% pot avg
  '33': 33,
  '50': 58,    // [50, 66]
  '75': 75,
  '100': 110,  // [100, 125]
  '150': 150,
  '200+': 250, // [200, 300, 999]
};

function mdfFoldFromBucket(sizing) {
  const pct = BUCKET_CENTER_PCT[sizing] ?? 50;
  // bettor's MDF_call = pot_odds_to_bet = bet / (pot + bet). Defender folds
  // at most 1 − MDF_call.
  const betFrac = pct / 100;
  const mdfFold = betFrac / (1 + betFrac);
  return mdfFold;
}

// ─── P_real for fold-based exploits ──────────────────────────────────────
//
// Beta(α0+folds, β0+nonfolds) posterior on fold fraction, with population
// prior pseudo-count of 50 hands centered on the MDF threshold (so the prior
// is neutral about whether the leak exists).
//
// We then normal-approximate the Beta posterior — exact Beta CDF is overkill
// at the sample sizes we work with (response_sample ≥ 100). Posterior mean
// ≈ p̂; posterior variance ≈ p̂(1−p̂) / (N + α0 + β0).
const FOLD_PSEUDO_TOTAL = 50;

export function pRealFold({ sample, edge_pp, sizing, direction = 'over' }) {
  // direction='over' tests P(true_fold > MDF) — for overfold/load_bluff_zone.
  // direction='under' tests P(true_fold < MDF) — for no_bluff_zone (pool calls
  // too much, i.e. underfolds, so the value-bet claim wants the opposite tail).
  if (!sample || sample <= 0 || edge_pp == null) return null;
  const mdfFold = mdfFoldFromBucket(sizing);
  const observed_fold = clip(mdfFold + edge_pp / 100, 0.001, 0.999);
  const nEff = sample + FOLD_PSEUDO_TOTAL;
  const post_mean = (observed_fold * sample + mdfFold * FOLD_PSEUDO_TOTAL) / nEff;
  const post_se = Math.sqrt(post_mean * (1 - post_mean) / nEff);
  const z = (post_mean - mdfFold) / post_se;
  return direction === 'under' ? normalCdf(-z) : normalCdf(z);
}

// Direct SE of bluff EV. bluff_EV ≈ p_fold · pot − (1 − p_fold) · bet.
// dEV/d(p_fold) = pot + bet ≈ pot(1 + bet/pot) ≈ pot · (1 + sizing/100).
export function seGrossBluff({ sample, edge_pp, sizing, pot_bb }) {
  if (!sample || sample <= 0) return null;
  const mdfFold = mdfFoldFromBucket(sizing);
  const fold_pct = clip(mdfFold + (edge_pp ?? 0) / 100, 0.001, 0.999);
  const nEff = sample + FOLD_PSEUDO_TOTAL;
  const se_fold = Math.sqrt(fold_pct * (1 - fold_pct) / nEff);
  const betPct = (BUCKET_CENTER_PCT[sizing] ?? 50) / 100;
  const bet_bb = (pot_bb ?? 0) * betPct;
  const slope = (pot_bb ?? 0) + bet_bb;
  return slope * se_fold;
}

// ─── P_real and SE for facing-call (value-based) exploits ────────────────
//
// On the river (where all facing_call exploits live — verified in exploits.mjs:
// only river facing nodes are scanned) the call outcome is binary: defender
// wins (pot + bet) or loses (call cost). Variance of a two-outcome RV with
// outcomes +A, −C and win-prob w is w(1−w)(A+C)². Given observed mean EV, we
// can back out implied w and compute the exact SE of mean.
function impliedWinProb({ ev_bb, pot_bb, sizing }) {
  const betPct = (BUCKET_CENTER_PCT[sizing] ?? 50) / 100;
  const bet = (pot_bb ?? 0) * betPct;
  const totalPot = (pot_bb ?? 0) + 2 * bet; // pot after defender calls
  // EV(call) = w·(pot + bet) − (1 − w)·bet = w·totalPot − bet
  const w = (ev_bb + bet) / Math.max(1e-9, totalPot);
  return { w: clip(w, 0.001, 0.999), totalPot, bet };
}

export function seCallEv({ sample, ev_bb, pot_bb, sizing }) {
  if (!sample || sample <= 0) return null;
  const { w, totalPot } = impliedWinProb({ ev_bb, pot_bb, sizing });
  return totalPot * Math.sqrt(w * (1 - w) / sample);
}

export function pRealCall({ sample, ev_bb, pot_bb, sizing, sign }) {
  // sign = +1 for +EV side (calling is profitable),
  // sign = −1 for −EV side (folding is correct, so we want P(true_ev < 0)).
  const se = seCallEv({ sample, ev_bb, pot_bb, sizing });
  if (se == null) return null;
  if (sign > 0) return normalCdf(ev_bb / se);       // P(true_ev > 0)
  else          return normalCdf(-ev_bb / se);      // P(true_ev < 0)
}

// ─── CONF bucketing ──────────────────────────────────────────────────────
export function confLabel(p_real) {
  if (p_real == null) return 'missing';
  if (p_real >= 0.95) return 'high';
  if (p_real >= 0.80) return 'medium';
  return 'low';
}

// ─── Annotate per-row confidence (P_real, CONF, SE of gross) ─────────────
export function annotateConfidence(exploits) {
  for (const e of exploits) {
    let p_real = null, se_gross = null;
    if (e.type === 'overfold' || e.type === 'load_bluff_zone') {
      p_real = pRealFold({ sample: e.sample, edge_pp: e.edge_pp, sizing: e.sizing, direction: 'over' });
      se_gross = seGrossBluff({ sample: e.sample, edge_pp: e.edge_pp, sizing: e.sizing, pot_bb: e.pot_bb });
    } else if (e.type === 'no_bluff_zone') {
      p_real = pRealFold({ sample: e.sample, edge_pp: e.edge_pp, sizing: e.sizing, direction: 'under' });
      se_gross = seGrossBluff({ sample: e.sample, edge_pp: e.edge_pp, sizing: e.sizing, pot_bb: e.pot_bb });
    } else if (e.type === 'facing_call_+ev') {
      p_real = pRealCall({ sample: e.sample, ev_bb: e.ev_bb, pot_bb: e.pot_bb, sizing: e.sizing, sign: +1 });
      se_gross = seCallEv({ sample: e.sample, ev_bb: e.ev_bb, pot_bb: e.pot_bb, sizing: e.sizing });
    } else if (e.type === 'facing_call_-ev') {
      p_real = pRealCall({ sample: e.sample, ev_bb: e.ev_bb, pot_bb: e.pot_bb, sizing: e.sizing, sign: -1 });
      se_gross = seCallEv({ sample: e.sample, ev_bb: e.ev_bb, pot_bb: e.pot_bb, sizing: e.sizing });
    }
    // multistreet & unknown types: leave p_real null; conf will be 'missing'.
    e.p_real = p_real;
    e.conf_stat = confLabel(p_real);
    e.se_gross = se_gross;
  }
  return exploits;
}

// ─── Alpha confidence — propagate SE through α = gross − max(0, mirror) ──
const MIRROR_THIN_THRESHOLD = 300;

export function annotateAlphaConfidence(exploits) {
  // Build an index of facing-call rows keyed exactly like alpha.mjs does, so
  // we can look up the *full* mirror row (sample, ev_bb, pot_bb) for SE.
  const facing = new Map();
  for (const e of exploits) {
    if (e.type === 'facing_call_+ev' || e.type === 'facing_call_-ev') {
      facing.set(`${e.street}|${e.line}|${e.sizing}|${e.perspective}`, e);
    }
  }

  for (const e of exploits) {
    if (!e.alpha) continue;
    const a = e.alpha;
    const se_gross = e.se_gross ?? 0;

    if (a.kind !== 'bet') {
      // Counter/fold/multistreet: alpha is the gross itself (or 0), so
      // SE_alpha == SE_gross and no mirror exists for this row.
      a.se_alpha = se_gross;
      a.alpha_floor = a.alpha_bb - 1.65 * se_gross;
      a.p_mirror_positive = null;
      a.mirror_sample = null;
      a.mirror_sample_thin = false;
      continue;
    }

    // Bet row — look up the mirror facing exploit to get its sample & SE.
    const opp = e.perspective === 'ip' ? 'oop' : 'ip';
    const mirror = facing.get(`${e.street}|${e.line}|${e.sizing}|${opp}`);

    if (!mirror) {
      // No counter found in the ranked feed → assume mirror_call ≈ 0 with
      // unknown SE. Use SE_gross only. mirror_missing is a separate state
      // from "thin": thin = small-sample counter; missing = no counter row.
      a.se_alpha = se_gross;
      a.alpha_floor = a.alpha_bb - 1.65 * se_gross;
      a.p_mirror_positive = null;
      a.mirror_sample = null;
      a.mirror_sample_thin = false;
      a.mirror_missing = true;
      continue;
    }
    a.mirror_missing = false;

    const se_mirror = seCallEv({
      sample: mirror.sample, ev_bb: mirror.ev_bb,
      pot_bb: mirror.pot_bb, sizing: mirror.sizing,
    }) ?? 0;
    const p_mirror_pos = mirror.ev_bb != null && se_mirror > 0
      ? normalCdf(mirror.ev_bb / se_mirror) : null;
    const gate_open = mirror.ev_bb > 0;

    // Gate open: alpha = gross − mirror, Var(alpha) = Var(gross) + Var(mirror).
    // Gate closed: alpha = gross, Var(alpha) = Var(gross) — but the gate itself
    // is uncertain near zero, so blend in mirror-variance weighted by
    // P(mirror > 0) to keep the floor honest when the gate is soft.
    let se_alpha;
    if (gate_open) {
      se_alpha = Math.sqrt(se_gross * se_gross + se_mirror * se_mirror);
    } else {
      const blend = p_mirror_pos ?? 0;
      se_alpha = Math.sqrt(se_gross * se_gross + blend * se_mirror * se_mirror);
    }

    a.se_alpha = se_alpha;
    a.alpha_floor = a.alpha_bb - 1.65 * se_alpha;
    a.p_mirror_positive = p_mirror_pos;
    a.mirror_sample = mirror.sample ?? null;
    a.mirror_sample_thin = (mirror.sample ?? 0) < MIRROR_THIN_THRESHOLD;
  }
  return exploits;
}

// ─── Benjamini-Hochberg FDR control ─────────────────────────────────────
//
// Treat 1 − P_real as the row's p-value (small = strong evidence the edge
// is real). Sort ascending, find the largest k where p_(k) ≤ k·q/m, mark
// the top-k as survives_fdr=true.
export function applyFdr(exploits, q = 0.10) {
  const withP = exploits.filter(e => e.p_real != null);
  const m = withP.length;
  if (m === 0) {
    for (const e of exploits) e.survives_fdr = false;
    return exploits;
  }
  const sorted = [...withP]
    .map(e => ({ e, p: 1 - e.p_real }))
    .sort((a, b) => a.p - b.p);
  let cutoff = -1;
  for (let i = 0; i < sorted.length; i++) {
    const thresh = ((i + 1) * q) / m;
    if (sorted[i].p <= thresh) cutoff = i;
  }
  const survivors = new Set();
  for (let i = 0; i <= cutoff; i++) survivors.add(sorted[i].e);
  for (const e of exploits) {
    e.survives_fdr = survivors.has(e);
  }
  return exploits;
}

// ─── IMPACT recompute — durable AND confirmed AND real ───────────────────
//
// Old impact = freq × pot × |EV|. New impact uses alpha_floor instead of |EV|
// (penalises crowded/counterable bets), gates on P_real (unconfirmed edges
// can't top the list), and zeros out anything that didn't survive FDR.
//
// Persistence multiplier (frequency_delta, mirror_delta) is wired in as 1
// for now — replace once temporal data is available.
export function recomputeImpact(exploits) {
  for (const e of exploits) {
    const floor = e.alpha?.alpha_floor ?? 0;
    const positiveFloor = Math.max(0, floor);
    const pReal = e.p_real ?? 0;
    const fdr = e.survives_fdr ? 1 : 0;
    const persistence = 1; // placeholder
    const freq = e.node_frequency || 1;
    const pot = e.pot_bb || 1;
    e.impact_score = freq * pot * positiveFloor * pReal * persistence * fdr;
    // Placeholders for the deferred temporal split.
    e.frequency_delta = null;
    e.mirror_delta = null;
  }
  return exploits;
}
