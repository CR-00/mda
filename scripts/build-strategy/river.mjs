// River EV lookup table generator.
//
// River nodes are pure arithmetic: no recursion. Two decision types:
//
//   1. Perspective bets the river. Source: perspective's own file at this
//      line. For each sizing bucket we observe pool's BF/BC/BR response.
//      EV math (per spec, raises absorbed into "not folded"):
//        bluff_ev_bb = (bf - bc * s) * pot
//        value_ev_bb = bc * s * pot         (nut value, raises ignored)
//        mdf         = s / (1 + s)          (break-even fold-freq for bluff)
//        overfold_pp = (bf - mdf) * 100
//      Optimal bluff/value sizes pick the bucket with max EV.
//
//   2. Perspective faces a river bet. Source: villain-perspective file at the
//      *villain's* river-bet line. The catchVevPct field on size rows is
//      hero's call-EV in pot-units; bluffVev on the matching fold-file row is
//      hero's raise-bluff EV in bb.
//      For now: call_ev_bb = catchVevPct * pot; fold_ev_bb = 0.
//      Raise EV deferred to backward induction (needs the fold-file lookup).
//
// Confidence: response_sample = sum of next-action counts in the bucket.
//   high >= 1000, medium >= 100, low < 100. Low rows are emitted with a flag.

import { findOverall, sizeRows, isPerspectiveBetTerminal, streetForLine, confidenceLabel, parseResponseCounts } from './lib/rows.mjs';
import { aggregateRowsByBucket, SIZE_BUCKETS } from './lib/buckets.mjs';

const MIN_RESPONSE_SAMPLE = 100;

function evForBucket(b) {
  const s = b.pctPot_avg ?? 0;
  const pot = b.pot_avg ?? 0;
  const mdf = s > 0 ? s / (1 + s) : 0;
  return {
    bucket: b.bucket,
    label: b.label,
    member_pcts: b.member_pcts,
    pctPot_avg: s,
    pot_bb: pot,
    response_sample: b.response_sample,
    hits: b.hits,
    bf: b.bf, bc: b.bc, br: b.br,
    mdf_threshold: mdf,
    overfold_pp: (b.bf - mdf) * 100,
    bluff_ev_bb: (b.bf - b.bc * s) * pot,
    value_ev_bb: b.bc * s * pot,
    confidence: confidenceLabel(b.response_sample),
  };
}

function pickOptimal(perSize, key) {
  let best = null;
  for (const row of Object.values(perSize)) {
    if (row.response_sample < MIN_RESPONSE_SAMPLE) continue;
    if (!best || row[key] > best[key]) best = row;
  }
  return best;
}

// Build the river-bet node from perspective's own file.
export function buildRiverBetNode({ bucketKey, line, file }) {
  const overall = findOverall(file.data);
  if (!overall) return null;
  const sizes = sizeRows(file.data);
  if (!sizes.length) return null;

  const buckets = aggregateRowsByBucket(sizes);
  const perSize = {};
  for (const b of Object.values(buckets)) {
    if ((b.response_sample || 0) === 0) continue;
    perSize[b.bucket] = evForBucket(b);
  }

  // Overall row response distribution (handles BF/BC/BR and RF/RC/RR alike).
  const overallResp = parseResponseCounts(overall.nextActions);
  const overall_bf = overallResp.fold, overall_bc = overallResp.call, overall_br = overallResp.raise;
  const tot = overallResp.sample;
  const overall_mdf = overall.pctPot ? overall.pctPot / (1 + overall.pctPot) : 0;

  const optimal_bluff = pickOptimal(perSize, 'bluff_ev_bb');
  const optimal_value = pickOptimal(perSize, 'value_ev_bb');

  return {
    node_id: `${bucketKey}|river_bet|${line}`,
    bucket: bucketKey,
    line,
    street: 'river',
    action_type: 'bet',
    sample_size: overall.hits || 0,
    response_sample: tot,
    confidence: confidenceLabel(tot),
    pot_bb: overall.pot ?? null,
    pool_overall: {
      pctPot: overall.pctPot,
      bf: overall_bf, bc: overall_bc, br: overall_br,
      mdf_threshold: overall_mdf,
      overfold_pp: (overall_bf - overall_mdf) * 100,
      alpha_threshold_avg: overall.alpha, // reference: hits-weighted MDF
      won: overall.won, wtsd: overall.wtsd, wsd: overall.wsd,
    },
    per_size: perSize,
    optimal_bluff_size: optimal_bluff?.bucket ?? null,
    optimal_bluff_ev_bb: optimal_bluff?.bluff_ev_bb ?? null,
    optimal_value_size: optimal_value?.bucket ?? null,
    optimal_value_ev_bb: optimal_value?.value_ev_bb ?? null,
    exploits_flagged: [],          // stage 5
    detection_aware_variant: null, // stage 6
  };
}

// Build the facing-river-bet node from villain-perspective's file.
// Hero is on the river facing villain's bet. catchVevPct on each size row =
// hero's call-EV as a fraction of pot. fold EV = 0 by definition.
export function buildRiverFacingNode({ bucketKey, line, file, mirrorLine }) {
  const overall = findOverall(file.data);
  if (!overall) return null;
  const sizes = sizeRows(file.data);
  if (!sizes.length) return null;

  // Per-size: aggregate response counts (to know how often villain made each size)
  // and pull catchVevPct as a hits-weighted mean per bucket.
  const buckets = aggregateRowsByBucket(sizes);
  const catchPerBucket = {};
  for (const b of SIZE_BUCKETS) catchPerBucket[b.id] = { num: 0, den: 0, count: 0 };
  for (const r of sizes) {
    const pct = parseInt(String(r.value).match(/(\d+)/)?.[1] ?? '0', 10);
    const bid = SIZE_BUCKETS.find(b => b.members.includes(pct))?.id;
    if (!bid) continue;
    if (r.catchVevPct == null) continue;
    catchPerBucket[bid].num += r.catchVevPct * (r.hits || 0);
    catchPerBucket[bid].den += (r.hits || 0);
    catchPerBucket[bid].count++;
  }

  const perSize = {};
  for (const b of Object.values(buckets)) {
    if ((b.hits || 0) === 0) continue;
    const c = catchPerBucket[b.bucket];
    const catchPct = c.den ? c.num / c.den : null;
    const call_ev_bb = catchPct != null && b.pot_avg != null ? catchPct * b.pot_avg : null;
    perSize[b.bucket] = {
      bucket: b.bucket,
      label: b.label,
      member_pcts: b.member_pcts,
      pctPot_avg: b.pctPot_avg,
      pot_bb: b.pot_avg,
      villain_bet_freq_hits: b.hits, // how often villain chose this size
      catchVevPct: catchPct,
      call_ev_bb,
      fold_ev_bb: 0,
      confidence: confidenceLabel(b.hits),
    };
  }

  return {
    node_id: `${bucketKey}|river_facing|${line}`,
    bucket: bucketKey,
    line, // the hero-perspective line (e.g. X-X-XC for "called river"... actually we tag the decision spot)
    mirror_line: mirrorLine,
    street: 'river',
    action_type: 'facing_bet',
    sample_size: overall.hits || 0,
    pot_bb_at_decision: overall.pot ?? null, // villain's pre-bet pot view
    pool_overall: {
      pctPot: overall.pctPot,
      catchVevPct_overall: overall.catchVevPct,
      call_ev_bb_overall: overall.catchVevPct != null && overall.pot != null
        ? overall.catchVevPct * overall.pot
        : null,
    },
    per_size: perSize,
    exploits_flagged: [],
    detection_aware_variant: null,
  };
}

export function isRiverBetLine(line) {
  return streetForLine(line) === 'river' && isPerspectiveBetTerminal(line);
}
