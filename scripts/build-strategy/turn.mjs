// Turn EV via backward induction.
//
// Scope (v1, Overall-only slicing):
//   - Decision: perspective bets the turn at size s_t.
//   - Pool's response (bf_t, bc_t, br_t) comes from this file's Size rows.
//   - When pool calls, recurse to perspective's river decision in the
//     continuation line (turn_line + '-B' for "bet river", turn_line + '-X'
//     for "check river"), using Stage-3 river artifact for EV values.
//   - When pool raises, assume hero folds (matches spec — raises ignored).
//
// EV is reported per hand class:
//   - bluff_class: 0 equity at any showdown. On river: max(0, bet_bluff_ev).
//   - value_class: 100% equity at any showdown. On river: pot + max(0, bet_value_ev_incremental).
//
// Both absolute and incremental-over-check EVs are emitted:
//   - bluff_ev_incremental = bluff_ev_absolute - 0           (check-turn = give-up = 0)
//   - value_ev_incremental = value_ev_absolute - pot_at_turn (check-turn = win showdown)
//
// The incremental form is the headline "is betting +EV?" number.

import { findOverall, sizeRows, streetForLine, confidenceLabel, parseResponseCounts } from './lib/rows.mjs';
import { aggregateRowsByBucket } from './lib/buckets.mjs';

const MIN_RESPONSE_SAMPLE = 100;

// River continuation EVs from Stage-3 artifact.
function riverContinuation(riverArtifact, perspective, turnLine) {
  const betLine = `${turnLine}-B`;
  const checkLine = `${turnLine}-X`;
  const betNode = riverArtifact.bet_nodes[betLine];
  // (checkLine is perspective's check-river line; not used for EV directly
  // because for bluff_class check = 0 and for value_class check = pot_river,
  // both intrinsic. We still report whether the line exists for diagnostics.)
  return {
    bet_node_exists: !!betNode,
    check_line_exists: !!riverArtifact.bet_nodes[checkLine] || false, // sparse
    optimal_bluff_ev_bb: betNode?.optimal_bluff_ev_bb ?? 0,
    optimal_value_ev_bb_incremental: betNode?.optimal_value_ev_bb ?? 0,
    optimal_bluff_size: betNode?.optimal_bluff_size ?? null,
    optimal_value_size: betNode?.optimal_value_size ?? null,
    confidence: betNode?.confidence ?? 'missing',
  };
}

function evForBucket(b, pot_t, riverCont) {
  const s = b.pctPot_avg ?? 0;
  const P_new = pot_t * (1 + 2 * s);

  // Bluff class on river: max(0, optimal_bluff_ev) — give up if bluff -EV.
  const bluff_river_cont = Math.max(0, riverCont.optimal_bluff_ev_bb);

  // Value class on river: always wins showdown = P_new, plus any +EV extraction.
  const value_river_cont = P_new + Math.max(0, riverCont.optimal_value_ev_bb_incremental);

  const bf = b.bf, bc = b.bc, br = b.br;
  const cost_when_continues = (bc + br) * s * pot_t;

  // Absolute EVs (stack change from this decision onward)
  const bluff_ev_abs = bf * pot_t - cost_when_continues + bc * bluff_river_cont;
  const value_ev_abs = bf * pot_t - cost_when_continues + bc * value_river_cont;

  // Check-turn baselines (approximations; ignores villain-bets-behind branch)
  const bluff_check_baseline = 0; // 0 equity, no fold equity from checking
  const value_check_baseline = pot_t; // win showdown at current pot

  return {
    bucket: b.bucket,
    label: b.label,
    member_pcts: b.member_pcts,
    pctPot_avg: s,
    pot_bb_pre_bet: pot_t,
    pot_bb_after_call: P_new,
    response_sample: b.response_sample,
    hits: b.hits,
    bf, bc, br,
    mdf_threshold: s > 0 ? s / (1 + s) : 0,
    overfold_pp: (bf - (s > 0 ? s / (1 + s) : 0)) * 100,
    river_continuation: riverCont,
    bluff_ev_bb_absolute: bluff_ev_abs,
    bluff_ev_bb_incremental: bluff_ev_abs - bluff_check_baseline,
    value_ev_bb_absolute: value_ev_abs,
    value_ev_bb_incremental: value_ev_abs - value_check_baseline,
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

export function buildTurnBetNode({ bucketKey, line, file, riverArtifact, perspective }) {
  const overall = findOverall(file.data);
  if (!overall) return null;
  const sizes = sizeRows(file.data);
  if (!sizes.length) return null;

  const pot_t = overall.pot ?? 0;
  const riverCont = riverContinuation(riverArtifact, perspective, line);

  const buckets = aggregateRowsByBucket(sizes);
  const perSize = {};
  for (const b of Object.values(buckets)) {
    if ((b.response_sample || 0) === 0) continue;
    perSize[b.bucket] = evForBucket(b, pot_t, riverCont);
  }

  // Pool's overall (hits-weighted) response
  const overallResp = parseResponseCounts(overall.nextActions);
  const overall_bf = overallResp.fold, overall_bc = overallResp.call, overall_br = overallResp.raise;
  const tot = overallResp.sample;
  const overall_s = overall.pctPot ?? 0;
  const overall_mdf = overall_s ? overall_s / (1 + overall_s) : 0;

  const optimal_bluff = pickOptimal(perSize, 'bluff_ev_bb_incremental');
  const optimal_value = pickOptimal(perSize, 'value_ev_bb_incremental');

  return {
    node_id: `${bucketKey}|turn_bet|${line}`,
    bucket: bucketKey,
    line,
    street: 'turn',
    action_type: 'bet',
    sample_size: overall.hits || 0,
    response_sample: tot,
    confidence: confidenceLabel(tot),
    pot_bb: pot_t,
    pool_overall: {
      pctPot: overall_s,
      bf: overall_bf, bc: overall_bc, br: overall_br,
      mdf_threshold: overall_mdf,
      overfold_pp: (overall_bf - overall_mdf) * 100,
      won: overall.won, wtsd: overall.wtsd, wsd: overall.wsd,
    },
    river_continuation_signal: {
      bet_line_present: riverCont.bet_node_exists,
      river_optimal_bluff_ev_bb: riverCont.optimal_bluff_ev_bb,
      river_optimal_value_ev_bb_incremental: riverCont.optimal_value_ev_bb_incremental,
      river_optimal_bluff_size: riverCont.optimal_bluff_size,
      river_optimal_value_size: riverCont.optimal_value_size,
      river_confidence: riverCont.confidence,
    },
    per_size: perSize,
    optimal_bluff_size: optimal_bluff?.bucket ?? null,
    optimal_bluff_ev_bb_incremental: optimal_bluff?.bluff_ev_bb_incremental ?? null,
    optimal_value_size: optimal_value?.bucket ?? null,
    optimal_value_ev_bb_incremental: optimal_value?.value_ev_bb_incremental ?? null,
    exploits_flagged: [],
    detection_aware_variant: null,
  };
}

export function isTurnBetLine(line) {
  if (streetForLine(line) !== 'turn') return false;
  const last = line.split('-').pop();
  // Perspective bet the turn means the last segment is a bet (B) — not BC/BF/BR which are villain responses.
  return last === 'B' || last === 'XB' || last === 'XRB' || last === 'XCB';
}
