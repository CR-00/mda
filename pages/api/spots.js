import { list } from '@vercel/blob';
import { parseBlobResponse } from '../../lib/blobJson.mjs';

async function readStrategyBlob(filename) {
  const { blobs } = await list({ prefix: filename });
  const blob = blobs.find(b => b.pathname === filename);
  if (!blob) return null;
  const r = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  return parseBlobResponse(r);
}

// Human-readable labels for the common lines.
const LABELS = {
  ip: {
    'B':       { label: 'C-bet flop',                street: 'flop',  category: 'aggressor' },
    'BR':      { label: 'C-bet, get raised, 3-bet',  street: 'flop',  category: 'aggressor' },
    'R':       { label: '3-bet flop',                street: 'flop',  category: 'aggressor' },
    'B-B':     { label: 'Double-barrel turn',        street: 'turn',  category: 'aggressor' },
    'BC-B':    { label: 'Bet-call-bet turn',         street: 'turn',  category: 'aggressor' },
    'X-B':     { label: 'Delayed c-bet turn',        street: 'turn',  category: 'aggressor' },
    'C-B':     { label: 'Bet after calling flop',    street: 'turn',  category: 'aggressor' },
    'BR-B':    { label: 'Continued aggression turn', street: 'turn',  category: 'aggressor' },
    'R-B':     { label: '3-bet, bet turn',           street: 'turn',  category: 'aggressor' },
    'B-B-B':   { label: 'Triple-barrel river',       street: 'river', category: 'aggressor' },
    'B-X-B':   { label: 'Bet-check-bet (delayed turn)', street: 'river', category: 'aggressor' },
    'X-B-B':   { label: 'Probe turn, barrel river',  street: 'river', category: 'aggressor' },
    'X-X-B':   { label: 'Stab river (both checked)', street: 'river', category: 'aggressor' },
    'BC-B-B':  { label: 'Reraise-call line river',   street: 'river', category: 'aggressor' },
    'BC-X-B':  { label: 'Bet-call-check-bet river',  street: 'river', category: 'aggressor' },
    'BC-C-B':  { label: 'Bet-call-call-bet river',   street: 'river', category: 'aggressor' },
    'C-B-B':   { label: 'Call flop, lead turn+river',street: 'river', category: 'aggressor' },
    'C-X-B':   { label: 'Call flop, check, bet river',street: 'river',category: 'aggressor' },
    'C-C-B':   { label: 'Call flop+turn, bet river', street: 'river', category: 'aggressor' },
    'C-R-B':   { label: 'Call-raise-bet river',      street: 'river', category: 'aggressor' },
    'R-B-B':   { label: '3-bet+barrel river',        street: 'river', category: 'aggressor' },
    'R-X-B':   { label: '3-bet, check, bet river',   street: 'river', category: 'aggressor' },
    'X-BC-B':  { label: 'Check-flop-call-bet river', street: 'river', category: 'aggressor' },
    'X-C-B':   { label: 'X-call-bet river',          street: 'river', category: 'aggressor' },
    'X-R-B':   { label: 'X-raise-bet river',         street: 'river', category: 'aggressor' },
  },
  oop: {
    'B':       { label: 'Donk-lead flop',            street: 'flop',  category: 'aggressor' },
    'XR':      { label: 'Check-raise flop',          street: 'flop',  category: 'aggressor' },
    'BR':      { label: 'Donk, get raised, 3-bet',   street: 'flop',  category: 'aggressor' },
    'XRR':     { label: 'Check-raise, 3-bet',        street: 'flop',  category: 'aggressor' },
    'B-B':     { label: 'Donk-and-barrel turn',      street: 'turn',  category: 'aggressor' },
    'X-B':     { label: 'Probe turn',                street: 'turn',  category: 'aggressor' },
    'XC-B':    { label: 'Float & lead turn',         street: 'turn',  category: 'aggressor' },
    'XR-B':    { label: 'Check-raise + barrel turn', street: 'turn',  category: 'aggressor' },
    'BR-B':    { label: 'Donk-3-bet-barrel turn',    street: 'turn',  category: 'aggressor' },
    'XC-XR-B': { label: 'Check-call, check-raise, bet', street: 'turn', category: 'aggressor' },
    'B-B-B':   { label: 'Triple-barrel donk-lead',   street: 'river', category: 'aggressor' },
    'B-X-B':   { label: 'Donk, check, bet river',    street: 'river', category: 'aggressor' },
    'X-B-B':   { label: 'Probe turn + barrel river', street: 'river', category: 'aggressor' },
    'X-X-B':   { label: 'Stab river (both checked)', street: 'river', category: 'aggressor' },
    'XC-B':    { label: 'Float, lead river',         street: 'river', category: 'aggressor' },
    'XC-X-B':  { label: 'XC-flop, check, bet river', street: 'river', category: 'aggressor' },
    'XC-XC-B': { label: 'Check-call, check-call, lead', street: 'river', category: 'aggressor' },
    'XR-B-B':  { label: 'Check-raise + double-barrel', street: 'river', category: 'aggressor' },
    'XR-X-B':  { label: 'CR-flop, check, bet river', street: 'river', category: 'aggressor' },
  },
};

function recommendation(node, multistreet) {
  if (!node) return null;
  const optBluff = node.optimal_bluff_ev_bb_incremental ?? node.optimal_bluff_ev_bb ?? null;
  const optValue = node.optimal_value_ev_bb_incremental ?? node.optimal_value_ev_bb ?? null;
  const bestSize = optBluff > (optValue ?? 0) ? node.optimal_bluff_size : node.optimal_value_size;
  const bestEv = Math.max(optBluff ?? -Infinity, optValue ?? -Infinity);
  if (bestEv == null || bestEv <= 0) return { verb: 'check / give up', best_size: null, best_ev_bb: bestEv ?? 0 };
  const type = (optBluff ?? -Infinity) > (optValue ?? -Infinity) ? 'bluff' : 'value';
  return {
    verb: type === 'bluff' ? 'bluff' : 'value bet',
    best_size: bestSize,
    best_ev_bb: bestEv,
    type,
    multistreet_strategy: multistreet?.recommended_strategy ?? null,
    multistreet_ev_bb: multistreet?.recommended_ev_bb ?? null,
  };
}

const MIN_FACE_SAMPLE = 100;
function defenseSummary(facingNode) {
  if (!facingNode || !facingNode.per_size) return null;
  const sizes = Object.entries(facingNode.per_size).map(([k, v]) => ({
    bucket: k,
    pctPot: v.pctPot_avg,
    call_ev_bb: v.call_ev_bb,
    sample: v.villain_bet_freq_hits,
    confidence: v.confidence,
  })).filter(s => s.call_ev_bb != null && (s.sample ?? 0) >= MIN_FACE_SAMPLE);
  return {
    overall_pot_bb: facingNode.pot_bb_at_decision,
    pool_overall: facingNode.pool_overall,
    per_size: sizes,
  };
}

// Look up a next-street continuation EV for the spot's own line. Used to
// derive a chain hint on turn/river spots (the flop-level multistreet
// artifact only covers flop-rooted chains).
function continuationHint(line, street, turnArt, riverArt) {
  const nextLine = `${line}-B`;
  if (street === 'flop') {
    const t = turnArt?.bet_nodes?.[nextLine];
    if (!t) return null;
    const ev = t.optimal_bluff_ev_bb_incremental ?? 0;
    if (ev > 1.0) return { label: 'turn barrel +EV', ev_bb: ev, conf: t.confidence };
  } else if (street === 'turn') {
    const r = riverArt?.bet_nodes?.[nextLine];
    if (!r) return null;
    const ev = r.optimal_bluff_ev_bb ?? 0;
    if (ev > 1.0) return { label: 'river barrel +EV', ev_bb: ev, conf: r.confidence };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const bucket = req.query.bucket || 'BB_vs_LP_srp_reg';
  const perspective = (req.query.perspective === 'oop') ? 'oop' : 'ip';

  const [river, turn, flop, multistreet] = await Promise.all([
    readStrategyBlob(`strategy/river_${bucket}_${perspective}.json`),
    readStrategyBlob(`strategy/turn_${bucket}_${perspective}.json`),
    readStrategyBlob(`strategy/flop_${bucket}_${perspective}.json`),
    readStrategyBlob(`strategy/multistreet_${bucket}_${perspective}.json`),
  ]);
  if (!river || !turn || !flop) {
    return res.status(404).json({ error: 'strategy library not built for this bucket/perspective' });
  }

  const labels = LABELS[perspective] || {};
  const out = { bucket, perspective, spots: [], defenses: [] };

  // Aggressor spots — union of flop/turn/river bet_nodes.
  const collect = (artifact, street) => {
    for (const [line, node] of Object.entries(artifact.bet_nodes || {})) {
      const meta = labels[line] || { label: line, street, category: 'aggressor' };
      const ms = multistreet?.barrel_lines?.[line] || (multistreet?.float_lines?.[line] ?? null);
      const chain = continuationHint(line, street, turn, river);
      out.spots.push({
        line, street, label: meta.label, category: 'aggressor',
        sample_size: node.sample_size, confidence: node.confidence,
        pot_bb: node.pot_bb,
        pool_overall: node.pool_overall,
        per_size: node.per_size,
        recommendation: recommendation(node, ms),
        multistreet: ms || null,
        continuation_hint: chain,
      });
    }
  };
  collect(flop,  'flop');
  collect(turn,  'turn');
  collect(river, 'river');

  // Defender spots — river facing_nodes are the main practical defense decisions.
  for (const [mirrorLine, fn] of Object.entries(river.facing_nodes || {})) {
    const ds = defenseSummary(fn);
    if (!ds || ds.per_size.length === 0) continue;     // drop spots with no usable sample
    out.defenses.push({
      mirror_line: mirrorLine,
      label: `Defending vs villain's ${mirrorLine}`,
      sample_size: fn.sample_size,
      pot_bb: fn.pot_bb_at_decision,
      pool_overall: fn.pool_overall,
      per_size: ds.per_size,
    });
  }

  // Order: by street (flop→turn→river), then by sample size desc.
  const streetOrder = { flop: 0, turn: 1, river: 2 };
  out.spots.sort((a, b) => (streetOrder[a.street] - streetOrder[b.street]) || (b.sample_size - a.sample_size));
  out.defenses.sort((a, b) => b.sample_size - a.sample_size);

  return res.status(200).json(out);
}
