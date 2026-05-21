// Sizing bucket definitions. Data sizes (% pot): 10, 25, 33, 50, 66, 75, 100, 125, 150, 200, 300, 999.
// 7-bucket schema confirmed with user: keep 25 and 200+ distinct.
export const SIZE_BUCKETS = [
  { id: '25',   label: '≤25%',  members: [10, 25] },
  { id: '33',   label: '33%',        members: [33] },
  { id: '50',   label: '50–66%', members: [50, 66] },
  { id: '75',   label: '75%',        members: [75] },
  { id: '100',  label: '100–125%', members: [100, 125] },
  { id: '150',  label: '150%',       members: [150] },
  { id: '200+', label: '200%+',      members: [200, 300, 999] },
];

const PCT_TO_BUCKET = (() => {
  const m = new Map();
  for (const b of SIZE_BUCKETS) for (const p of b.members) m.set(p, b.id);
  return m;
})();

// "75% " (with trailing space) -> 75
export function parseSizePct(value) {
  const m = String(value).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function bucketForPct(pct) {
  return PCT_TO_BUCKET.get(pct) ?? null;
}

// Aggregate a list of per-size rows into per-bucket counts and weighted-mean pctPot.
// Each row contributes its full nextActions counts to its bucket.
export function aggregateRowsByBucket(rows) {
  const buckets = {};
  for (const b of SIZE_BUCKETS) {
    buckets[b.id] = {
      bucket: b.id,
      label: b.label,
      hits: 0, opps: 0,
      bf_count: 0, bc_count: 0, br_count: 0,
      pctPot_weighted_num: 0, pctPot_weighted_den: 0,
      pot_weighted_num: 0, pot_weighted_den: 0,
      member_pcts: [],
    };
  }
  for (const r of rows) {
    const pct = parseSizePct(r.value);
    const bid = bucketForPct(pct);
    if (!bid) continue;
    const b = buckets[bid];
    const next = r.nextActions || {};
    // Response keys vary by perspective's own action: BF/BC/BR (vs bet) or
    // RF/RC/RR (vs raise). Match by single-letter suffix, skip dashed keys
    // (those are next-street openings).
    let bf = 0, bc = 0, br = 0;
    for (const [k, v] of Object.entries(next)) {
      if (k.includes('-')) continue;
      if (k.endsWith('F')) bf += v;
      else if (k.endsWith('C')) bc += v;
      else if (k.endsWith('R') || k.endsWith('B')) br += v;
    }
    const respTotal = bf + bc + br;
    b.hits += r.hits || 0;
    b.opps += r.opps || 0;
    b.bf_count += bf;
    b.bc_count += bc;
    b.br_count += br;
    // weight pctPot by hits (the count of times perspective bet this size)
    b.pctPot_weighted_num += (r.pctPot || 0) * (r.hits || 0);
    b.pctPot_weighted_den += (r.hits || 0);
    // weight pot by hits too — pot is per-occurrence
    b.pot_weighted_num += (r.pot || 0) * (r.hits || 0);
    b.pot_weighted_den += (r.hits || 0);
    b.member_pcts.push(pct);
  }
  for (const b of Object.values(buckets)) {
    const respTotal = b.bf_count + b.bc_count + b.br_count;
    b.response_sample = respTotal;
    b.bf = respTotal ? b.bf_count / respTotal : 0;
    b.bc = respTotal ? b.bc_count / respTotal : 0;
    b.br = respTotal ? b.br_count / respTotal : 0;
    b.pctPot_avg = b.pctPot_weighted_den ? b.pctPot_weighted_num / b.pctPot_weighted_den : null;
    b.pot_avg = b.pot_weighted_den ? b.pot_weighted_num / b.pot_weighted_den : null;
  }
  return buckets;
}
