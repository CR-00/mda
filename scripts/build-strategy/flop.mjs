// Flop EV via backward induction over the turn artifact.
//
// Same recursion structure as turn.mjs, one street up. When pool calls a
// flop bet, perspective's turn decision is either bet (continuation line
// flop_line + '-B') or check (flop_line + '-X'). For both hand classes we
// use the value of the best turn action vs the check baseline:
//   bluff_turn_cont = max(0, turn_node.optimal_bluff_ev_bb_incremental)
//   value_turn_cont = P_new + max(0, turn_node.optimal_value_ev_bb_incremental)
//
// "Perspective bets flop" lines are single-segment lines ending with B or R
// (B = open bet, R = check-raise as perspective's first aggressive flop action).

import { findOverall, sizeRows, streetForLine, confidenceLabel, parseResponseCounts } from './lib/rows.mjs';
import { aggregateRowsByBucket } from './lib/buckets.mjs';

const MIN_RESPONSE_SAMPLE = 100;

function turnContinuation(turnArtifact, flopLine) {
  const betLine = `${flopLine}-B`;
  const betNode = turnArtifact.bet_nodes[betLine];
  return {
    bet_node_exists: !!betNode,
    optimal_bluff_ev_bb_incremental: betNode?.optimal_bluff_ev_bb_incremental ?? 0,
    optimal_value_ev_bb_incremental: betNode?.optimal_value_ev_bb_incremental ?? 0,
    optimal_bluff_size: betNode?.optimal_bluff_size ?? null,
    optimal_value_size: betNode?.optimal_value_size ?? null,
    confidence: betNode?.confidence ?? 'missing',
  };
}

function evForBucket(b, pot_f, turnCont) {
  const s = b.pctPot_avg ?? 0;
  const P_new = pot_f * (1 + 2 * s);

  const bluff_turn_cont = Math.max(0, turnCont.optimal_bluff_ev_bb_incremental);
  const value_turn_cont = P_new + Math.max(0, turnCont.optimal_value_ev_bb_incremental);

  const bf = b.bf, bc = b.bc, br = b.br;
  const cost_when_continues = (bc + br) * s * pot_f;

  const bluff_ev_abs = bf * pot_f - cost_when_continues + bc * bluff_turn_cont;
  const value_ev_abs = bf * pot_f - cost_when_continues + bc * value_turn_cont;

  return {
    bucket: b.bucket,
    label: b.label,
    member_pcts: b.member_pcts,
    pctPot_avg: s,
    pot_bb_pre_bet: pot_f,
    pot_bb_after_call: P_new,
    response_sample: b.response_sample,
    hits: b.hits,
    bf, bc, br,
    mdf_threshold: s > 0 ? s / (1 + s) : 0,
    overfold_pp: (bf - (s > 0 ? s / (1 + s) : 0)) * 100,
    turn_continuation: turnCont,
    bluff_ev_bb_absolute: bluff_ev_abs,
    bluff_ev_bb_incremental: bluff_ev_abs,        // bluff check-baseline = 0
    value_ev_bb_absolute: value_ev_abs,
    value_ev_bb_incremental: value_ev_abs - pot_f, // value check-baseline = pot_f (showdown)
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

export function buildFlopBetNode({ bucketKey, line, file, turnArtifact, perspective }) {
  const overall = findOverall(file.data);
  if (!overall) return null;
  const sizes = sizeRows(file.data);
  if (!sizes.length) return null;

  const pot_f = overall.pot ?? 0;
  const turnCont = turnContinuation(turnArtifact, line);

  const buckets = aggregateRowsByBucket(sizes);
  const perSize = {};
  for (const b of Object.values(buckets)) {
    if ((b.response_sample || 0) === 0) continue;
    perSize[b.bucket] = evForBucket(b, pot_f, turnCont);
  }

  const overallResp = parseResponseCounts(overall.nextActions);
  const overall_bf = overallResp.fold, overall_bc = overallResp.call, overall_br = overallResp.raise;
  const tot = overallResp.sample;
  const overall_s = overall.pctPot ?? 0;
  const overall_mdf = overall_s ? overall_s / (1 + overall_s) : 0;

  const optimal_bluff = pickOptimal(perSize, 'bluff_ev_bb_incremental');
  const optimal_value = pickOptimal(perSize, 'value_ev_bb_incremental');

  return {
    node_id: `${bucketKey}|flop_bet|${line}`,
    bucket: bucketKey,
    line,
    street: 'flop',
    action_type: 'bet',
    sample_size: overall.hits || 0,
    response_sample: tot,
    confidence: confidenceLabel(tot),
    pot_bb: pot_f,
    pool_overall: {
      pctPot: overall_s,
      bf: overall_bf, bc: overall_bc, br: overall_br,
      mdf_threshold: overall_mdf,
      overfold_pp: (overall_bf - overall_mdf) * 100,
      won: overall.won, wtsd: overall.wtsd, wsd: overall.wsd,
    },
    turn_continuation_signal: {
      bet_line_present: turnCont.bet_node_exists,
      turn_optimal_bluff_ev_bb_incremental: turnCont.optimal_bluff_ev_bb_incremental,
      turn_optimal_value_ev_bb_incremental: turnCont.optimal_value_ev_bb_incremental,
      turn_optimal_bluff_size: turnCont.optimal_bluff_size,
      turn_optimal_value_size: turnCont.optimal_value_size,
      turn_confidence: turnCont.confidence,
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

export function isFlopBetLine(line) {
  if (streetForLine(line) !== 'flop') return false;
  // Single segment, ends in B or R (open bet / check-raise).
  return /[BR]$/.test(line);
}
