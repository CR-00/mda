// Detection-aware variants.
//
// For each exploit, produce a tradeoff curve mixing the pure best-response
// with a balanced baseline. p ∈ [0,1] controls the mix:
//   p=1: pure exploit (max EV, max detection risk, max brittleness)
//   p=0: balanced baseline (matches pool's own action distribution, EV ≈ 0)
//
// EV at mix p, linear approximation (Restricted Nash Response style):
//   EV(p) = p × EV_pure + (1-p) × EV_balanced
// where EV_balanced is approximately 0 by definition of "balanced vs pool"
// (a strategy that doesn't deviate from population frequencies extracts no
// pure-exploit edge).
//
// detection_risk_score ∈ [0,1] is just p — a higher p means we deviate more
// often from population, so a smart villain can detect the leak faster.
//
// recommended_p is a heuristic by opponent class & confidence:
//   - high confidence + low-frequency play (rare line) → p=1 (full exploit; villain rarely sees us)
//   - high confidence + frequent play              → p=0.75
//   - medium confidence                            → p=0.5
//   - low confidence                               → p=0.25 (defensive)

const VARIANT_PS = [0.25, 0.5, 0.75, 1.0];

function recommendedP({ confidence, node_frequency }) {
  if (confidence === 'low') return 0.25;
  if (confidence === 'medium') return 0.5;
  // high
  return (node_frequency || 0) > 50000 ? 0.75 : 1.0;
}

export function detectionAwareVariants(exploit) {
  const purEv = exploit.ev_bb ?? exploit.bluff_ev_bb ?? exploit.value_ev_bb ?? 0;
  const variants = VARIANT_PS.map(p => ({
    p,
    ev_bb: purEv * p,
    ev_sacrificed_bb: purEv * (1 - p),
    detection_risk_score: p,
  }));
  return {
    pure_ev_bb: purEv,
    variants,
    recommended_p: recommendedP(exploit),
    notes: 'EV(p) linear interpolation between pure best-response (p=1) and balanced baseline (p=0, EV≈0). detection_risk_score = p.',
  };
}

export function annotateExploits(exploits) {
  for (const e of exploits) {
    e.detection_aware = detectionAwareVariants(e);
  }
  return exploits;
}

export function buildDetectionReport(exploits, topN = 50) {
  const top = exploits.slice(0, topN);
  let md = `# Detection-aware variants — top ${topN} exploits\n\n`;
  md += `Each exploit shows EV at four exploit-intensity levels (p=0.25..1.0).\n`;
  md += `Recommended p by class:  high-conf rare → 1.0  ·  high-conf frequent → 0.75  ·  medium → 0.5  ·  low → 0.25\n\n`;
  md += `| # | Line | Persp | Sizing | Pure EV (bb) | p=0.25 | p=0.5 | p=0.75 | p=1.0 | Rec. p | Description |\n`;
  md += `|---|------|-------|--------|-------------:|------:|-----:|------:|-----:|-----:|---|\n`;
  top.forEach((e, i) => {
    const d = e.detection_aware;
    const v = d.variants;
    md += `| ${i+1} | \`${e.line}\` | ${e.perspective} | ${e.sizing ?? e.sizing_chain ?? ''} | ${d.pure_ev_bb.toFixed(2)} | ${v[0].ev_bb.toFixed(2)} | ${v[1].ev_bb.toFixed(2)} | ${v[2].ev_bb.toFixed(2)} | ${v[3].ev_bb.toFixed(2)} | ${d.recommended_p} | ${e.description.replace(/\|/g, '\\|')} |\n`;
  });
  return md;
}
