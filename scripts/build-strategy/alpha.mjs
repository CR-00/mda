// Alpha — the counter-resistant component of an exploit's EV.
//
// Finance analogy:
//   gross EV   = total return
//   beta       = the part a thinking opponent can profitably arbitrage away
//                (= the mirror facing-node's positive call_ev, when present)
//   alpha      = gross − beta  — what survives once they counter.
//
// By type:
//   bet exploits (overfold / load_bluff_zone / no_bluff_zone):
//     alpha = gross_ev − max(0, mirror_call_ev)
//     If the defender's mirror call is +EV, they have a profitable reason to
//     stop folding → that portion of the bet EV will be / is being competed
//     out by MDA-aware villains → discount it. If the mirror call is ≤0, the
//     defender has no profitable counter → full bluff EV is durable.
//   facing_call_+ev (call/counter):
//     alpha = ev_bb  — pure alpha. Profits *from* the field over-extending
//     into bluffs; gets stronger as more regs pile into the standard bet
//     exploit. Negative beta to the meta.
//   facing_call_-ev:
//     alpha = 0  — folding is correct; no edge to capture.
//   multistreet:
//     alpha = ev_bb  — no per-street counter discount in v1 (would need
//     summing mirror call_ev across all streets in the chain).

function evOf(e) {
  return e.ev_bb ?? e.bluff_ev_bb ?? e.value_ev_bb ?? 0;
}

const BET_TYPES = new Set(['overfold', 'load_bluff_zone', 'no_bluff_zone']);

function mirrorKey(e, perspective) {
  return `${e.street}|${e.line}|${e.sizing}|${perspective}`;
}

export function annotateAlpha(exploits) {
  const facing = new Map();
  for (const e of exploits) {
    if (e.type === 'facing_call_+ev' || e.type === 'facing_call_-ev') {
      facing.set(mirrorKey(e, e.perspective), e.ev_bb);
    }
  }

  for (const e of exploits) {
    const gross = evOf(e);
    let kind, alpha, mirror = null;

    if (BET_TYPES.has(e.type)) {
      kind = 'bet';
      const opp = e.perspective === 'ip' ? 'oop' : 'ip';
      const m = facing.get(mirrorKey(e, opp));
      mirror = m == null ? null : m;
      const counter = mirror != null && mirror > 0 ? mirror : 0;
      alpha = gross - counter;
    } else if (e.type === 'facing_call_+ev') {
      kind = 'counter';
      alpha = gross;
    } else if (e.type === 'facing_call_-ev') {
      kind = 'fold';
      alpha = 0;
    } else if (e.type === 'multistreet') {
      kind = 'multistreet';
      alpha = gross;
    } else {
      kind = 'other';
      alpha = gross;
    }

    e.alpha = {
      alpha_bb: alpha,
      gross_ev_bb: gross,
      mirror_call_ev_bb: mirror,
      kind,
    };
  }
  return exploits;
}
