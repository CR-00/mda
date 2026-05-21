// Multi-street float and barrel analysis.
//
// Reads the river/turn/flop artifacts (already computed) and surfaces the
// chain as explicit scenarios:
//
//   1. Barrel chains (flop_bet → turn_bet → river_bet) — for each flop-bet
//      line, classify as triple/double/single barrel based on cascading +EV.
//      Decompose total bluff EV into per-street fold-equity contributions.
//
//   2. Float scenarios (flop_call → turn_lead) — for each post-call line
//      where perspective called flop, the turn-lead node is the "float +
//      take-it-away" play. Surface its bluff & value EV.

function pickBucket(perSize, key, opts = {}) {
  const minN = opts.minN ?? 100;
  let best = null;
  for (const row of Object.values(perSize)) {
    if (row.response_sample < minN) continue;
    if (!best || row[key] > best[key]) best = row;
  }
  return best;
}

// Per-street fold-equity contribution to a multi-street bluff, using the
// chosen sizing at each street. Decomposition (raises ignored, matches spec):
//   flop branch  = bf_f × P_flop
//   continue cost flop = (bc_f + br_f) × s_f × P_flop  (paid in all continue branches)
//   turn branch  = bc_f × ( bf_t × P_turn − (bc_t+br_t) × s_t × P_turn + recurse )
//   river branch = bc_f × bc_t × ( bf_r × P_river − (bc_r+br_r) × s_r × P_river )
//
// Decomposition is just the per-street terms; net EV = sum.
function decomposeBarrelEV({ flopNode, turnNode, riverNode, flopSize, turnSize, riverSize }) {
  const fS = flopNode?.per_size?.[flopSize];
  const tS = turnNode?.per_size?.[turnSize];
  const rS = riverNode?.per_size?.[riverSize];

  const P_flop  = flopNode?.pot_bb ?? 0;
  const P_turn  = tS?.pot_bb_pre_bet ?? (fS ? P_flop * (1 + 2 * (fS.pctPot_avg ?? 0)) : 0);
  const P_river = rS?.pot_bb ?? (tS ? P_turn * (1 + 2 * (tS.pctPot_avg ?? 0)) : 0);

  const out = {
    flop_fold_branch_ev_bb: fS ? fS.bf * P_flop : 0,
    flop_cost_if_continues_bb: fS ? (fS.bc + fS.br) * (fS.pctPot_avg ?? 0) * P_flop : 0,
    flop_continue_prob: fS ? fS.bc : 0,
    turn_fold_branch_ev_bb: 0,
    turn_cost_if_continues_bb: 0,
    turn_continue_prob: 0,
    river_fold_branch_ev_bb: 0,
    river_cost_if_continues_bb: 0,
  };

  if (tS) {
    out.turn_fold_branch_ev_bb = (fS?.bc ?? 0) * tS.bf * P_turn;
    out.turn_cost_if_continues_bb = (fS?.bc ?? 0) * (tS.bc + tS.br) * (tS.pctPot_avg ?? 0) * P_turn;
    out.turn_continue_prob = (fS?.bc ?? 0) * tS.bc;
  }
  if (rS) {
    out.river_fold_branch_ev_bb = (fS?.bc ?? 0) * (tS?.bc ?? 0) * rS.bf * P_river;
    out.river_cost_if_continues_bb = (fS?.bc ?? 0) * (tS?.bc ?? 0) * (rS.bc + rS.br) * (rS.pctPot_avg ?? 0) * P_river;
  }

  out.total_ev_bb =
      out.flop_fold_branch_ev_bb
    - out.flop_cost_if_continues_bb
    + out.turn_fold_branch_ev_bb
    - out.turn_cost_if_continues_bb
    + out.river_fold_branch_ev_bb
    - out.river_cost_if_continues_bb;

  return out;
}

// Compute single-only / double-only / triple-barrel EVs by picking the
// optimal sizing at each street under that restricted strategy. The
// max-restricted-strategy EV is the headline number; alternatives quantify
// the marginal EV of each additional barrel.
function computeBarrelOptions({ flopNode, turnNode, riverNode }) {
  // Single barrel only: at the flop, give up if called. Optimal flop size
  // maximises bf_f × P − (bc_f+br_f) × s_f × P  (no continuation).
  let singleBest = null;
  if (flopNode) {
    for (const r of Object.values(flopNode.per_size)) {
      if (r.response_sample < 100) continue;
      const ev = r.bf * flopNode.pot_bb - (r.bc + r.br) * (r.pctPot_avg ?? 0) * flopNode.pot_bb;
      if (!singleBest || ev > singleBest.ev) singleBest = { ev, size: r.bucket };
    }
  }

  // Double-barrel: optimal flop size, then optimal turn size with give-up on river.
  // For each flop size, evaluate (flop branch) + bc_f × max(0, turn-bluff-ignoring-river).
  // "turn-bluff-ignoring-river" = max over s_t of (bf_t × P_turn − (bc_t+br_t) × s_t × P_turn).
  let turnOnlyBest = null;
  if (turnNode) {
    for (const r of Object.values(turnNode.per_size)) {
      if (r.response_sample < 100) continue;
      const ev = r.bf * r.pot_bb_pre_bet - (r.bc + r.br) * (r.pctPot_avg ?? 0) * r.pot_bb_pre_bet;
      if (!turnOnlyBest || ev > turnOnlyBest.ev) turnOnlyBest = { ev, size: r.bucket };
    }
  }
  let doubleBest = null;
  if (flopNode && turnOnlyBest && turnOnlyBest.ev > 0) {
    for (const r of Object.values(flopNode.per_size)) {
      if (r.response_sample < 100) continue;
      const ev =
        r.bf * flopNode.pot_bb
        - (r.bc + r.br) * (r.pctPot_avg ?? 0) * flopNode.pot_bb
        + r.bc * turnOnlyBest.ev;
      if (!doubleBest || ev > doubleBest.ev) doubleBest = { ev, size: r.bucket };
    }
  }

  // Triple-barrel: the full chain already in the flop artifact (optimal_bluff).
  const tripleEv = flopNode?.optimal_bluff_ev_bb_incremental ?? null;
  const tripleSize = flopNode?.optimal_bluff_size ?? null;

  return {
    single_barrel: singleBest ? { size: singleBest.size, ev_bb: singleBest.ev } : null,
    double_barrel: doubleBest ? { size: doubleBest.size, turn_size: turnOnlyBest.size, ev_bb: doubleBest.ev } : null,
    triple_barrel: tripleEv != null ? { size: tripleSize, ev_bb: tripleEv } : null,
  };
}

export function buildBarrelScenario({ flopNode, turnArtifact, riverArtifact, bucket, perspective }) {
  const line = flopNode.line;
  const turnNode  = turnArtifact.bet_nodes[`${line}-B`];
  const riverNode = riverArtifact.bet_nodes[`${line}-B-B`];

  const options = computeBarrelOptions({ flopNode, turnNode, riverNode });

  // Classification: pick the strategy with max EV.
  const candidates = [];
  if (options.single_barrel) candidates.push(['single_barrel', options.single_barrel.ev_bb]);
  if (options.double_barrel) candidates.push(['double_barrel', options.double_barrel.ev_bb]);
  if (options.triple_barrel) candidates.push(['triple_barrel', options.triple_barrel.ev_bb]);
  const best = candidates.reduce((a, b) => (a == null || b[1] > a[1] ? b : a), null);
  const recommended_strategy = best ? best[0] : 'no_bet';
  const recommended_ev_bb = best ? best[1] : 0;

  // Decomposition with the recommended sizing at each street.
  const flopSize  = options[recommended_strategy]?.size ?? flopNode.optimal_bluff_size;
  const turnSize  = (recommended_strategy !== 'single_barrel')
    ? (recommended_strategy === 'double_barrel' ? options.double_barrel.turn_size : turnNode?.optimal_bluff_size)
    : null;
  const riverSize = (recommended_strategy === 'triple_barrel') ? riverNode?.optimal_bluff_size : null;
  const decomposition = decomposeBarrelEV({
    flopNode, turnNode, riverNode,
    flopSize, turnSize, riverSize,
  });

  return {
    node_id: `${bucket}|barrel|${line}`,
    bucket, perspective, line, action_type: 'barrel',
    recommended_strategy,
    recommended_ev_bb,
    sizings: { flop: flopSize, turn: turnSize, river: riverSize },
    options,
    decomposition,
    confidence: {
      flop: flopNode.confidence,
      turn: turnNode?.confidence ?? 'missing',
      river: riverNode?.confidence ?? 'missing',
    },
    marginal_gains: {
      single_to_double_bb: options.double_barrel && options.single_barrel
        ? options.double_barrel.ev_bb - options.single_barrel.ev_bb : null,
      double_to_triple_bb: options.triple_barrel && options.double_barrel
        ? options.triple_barrel.ev_bb - options.double_barrel.ev_bb : null,
    },
  };
}

// Float scenario: perspective called flop → can lead the turn. Look up the
// `<flopCallLine>-B` turn-bet node directly.
export function buildFloatScenario({ flopCallLine, turnArtifact, bucket, perspective }) {
  const turnBetLine = `${flopCallLine}-B`;
  const turnNode = turnArtifact.bet_nodes[turnBetLine];
  if (!turnNode) return null;
  return {
    node_id: `${bucket}|float|${flopCallLine}`,
    bucket, perspective,
    flop_call_line: flopCallLine,
    turn_lead_line: turnBetLine,
    turn_lead_bluff: {
      ev_bb: turnNode.optimal_bluff_ev_bb_incremental,
      size: turnNode.optimal_bluff_size,
    },
    turn_lead_value: {
      ev_bb: turnNode.optimal_value_ev_bb_incremental,
      size: turnNode.optimal_value_size,
    },
    pool_response_overall: turnNode.pool_overall,
    confidence: turnNode.confidence,
    sample_size: turnNode.sample_size,
    recommended:
      Math.max(turnNode.optimal_bluff_ev_bb_incremental ?? 0, turnNode.optimal_value_ev_bb_incremental ?? 0, 0) === 0
        ? 'check'
        : (turnNode.optimal_value_ev_bb_incremental ?? 0) > (turnNode.optimal_bluff_ev_bb_incremental ?? 0)
          ? 'lead_value'
          : 'lead_bluff',
  };
}
