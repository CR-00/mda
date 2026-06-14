// Compact digest of a built bucket — used to author the written AI summaries.
//   node scripts/build-strategy/digest.mjs --bucket=SB_vs_BB_srp_reg
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.+))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const bucket = args.bucket ?? 'BB_vs_LP_srp_reg';
const load = (s, p) => JSON.parse(readFileSync(join('out', `${s}_${bucket}_${p}.json`), 'utf8'));

const F = (n, d = 2) => (n == null || Number.isNaN(n)) ? '—' : n.toFixed(d);
const lbl = (street) => street;

function betRows(node, street) {
  const ev = (r) => street === 'river' ? (r.bluff_ev_bb ?? r.value_ev_bb) : (r.bluff_ev_bb_incremental ?? r.value_ev_bb_incremental);
  return Object.entries(node.per_size || {}).map(([k, r]) => ({
    size: k, of: r.overfold_pp, ev: ev(r), n: r.response_sample, conf: r.confidence,
  })).filter(r => r.n != null);
}

function topBetNodes(art, street, limit = 6) {
  const nodes = Object.entries(art.bet_nodes || {}).map(([line, node]) => {
    const best = (street === 'river' ? (node.optimal_bluff_ev_bb ?? -1e9) : (node.optimal_bluff_ev_bb_incremental ?? -1e9));
    return { line, node, best };
  }).filter(x => x.best > -1e8).sort((a, b) => b.best - a.best).slice(0, limit);
  return nodes;
}

function dump(persp) {
  const river = load('river', persp), turn = load('turn', persp), flop = load('flop', persp), ms = load('multistreet', persp);
  console.log(`\n########## ${bucket} — ${persp.toUpperCase()} ##########`);
  for (const [art, street] of [[flop, 'flop'], [turn, 'turn'], [river, 'river']]) {
    console.log(`\n=== ${street} bet nodes (top by best bluff EV) ===`);
    for (const { line, node } of topBetNodes(art, street)) {
      console.log(`  ${line.padEnd(10)} pot=${F(node.pot_bb,1)}bb n=${node.sample_size} ${node.confidence}`);
      for (const r of betRows(node, street)) {
        console.log(`      ${String(r.size).padStart(4)}%  overfold ${F(r.of,1).padStart(6)}pp  EV ${F(r.ev).padStart(7)}bb  n=${r.n} ${r.conf}`);
      }
    }
  }
  console.log(`\n=== multistreet barrel recommendations ===`);
  for (const [line, s] of Object.entries(ms.barrel_lines || {})) {
    if (!s || s.recommended_strategy === 'no_bet') continue;
    console.log(`  ${line.padEnd(8)} ${s.recommended_strategy}  EV=${F(s.recommended_ev_bb)}bb  sizings=${JSON.stringify(s.sizings)}`);
  }
  console.log(`\n=== multistreet float scenarios ===`);
  for (const [line, s] of Object.entries(ms.float_lines || {})) {
    if (!s || s.recommended === 'check') continue;
    console.log(`  ${line.padEnd(8)} rec=${s.recommended} turnLeadBluff=${F(s.turn_lead_bluff?.ev_bb)}bb@${s.turn_lead_bluff?.size}% n=${s.turn_lead_bluff?.sample} ${s.turn_lead_bluff?.confidence}`);
  }
  console.log(`\n=== river DEFENSE (facing villain bets, call EV by size) ===`);
  for (const [mLine, fn] of Object.entries(river.facing_nodes || {})) {
    const sizes = Object.entries(fn.per_size || {}).map(([k, v]) => ({ k, ev: v.call_ev_bb, n: v.villain_bet_freq_hits, c: v.confidence, p: v.pctPot_avg })).filter(s => s.ev != null && (s.n ?? 0) >= 100);
    if (!sizes.length) continue;
    console.log(`  vs ${mLine.padEnd(10)} pot=${F(fn.pot_bb_at_decision,1)}bb`);
    for (const s of sizes) console.log(`      ${String(s.k).padStart(4)}% (avg ${F(s.p*100,0)}%)  callEV ${F(s.ev).padStart(7)}bb  n=${s.n} ${s.c}`);
  }
}

dump('ip');
dump('oop');

// exploits + detection toplines
const ex = JSON.parse(readFileSync(join('out', `exploits_${bucket}.json`), 'utf8'));
console.log(`\n########## TOP 12 EXPLOITS (combined) ##########  total=${ex.total}`);
for (const e of ex.ranked.slice(0, 12)) {
  console.log(`  [${e.perspective}] ${String(e.type).padEnd(16)} ${String(e.line).padEnd(10)} ${e.sizing ?? e.sizing_chain ?? ''} EV=${F(e.ev_bb ?? e.bluff_ev_bb ?? e.value_ev_bb)}bb edge=${e.edge_pp != null ? F(e.edge_pp,1)+'pp' : (e.strategy ?? '')} n=${e.sample} ${e.confidence}`);
}
