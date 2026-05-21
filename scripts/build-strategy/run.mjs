// CLI entry. Usage:
//   node --env-file=.env.local scripts/build-strategy/run.mjs --stage=river --bucket=BB_vs_LP_srp_reg
//   add --upload to also push artifacts to blob storage under strategy/

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listAllBlobs, parseFilename, readBlob, writeStrategyBlob } from './lib/blob.mjs';
import { buildRiverBetNode, buildRiverFacingNode, isRiverBetLine } from './river.mjs';
import { buildTurnBetNode, isTurnBetLine } from './turn.mjs';
import { buildFlopBetNode, isFlopBetLine } from './flop.mjs';
import { buildBarrelScenario, buildFloatScenario } from './multistreet.mjs';
import { buildExploits, buildReport } from './exploits.mjs';
import { annotateExploits, buildDetectionReport } from './detection.mjs';
import { streetForLine } from './lib/rows.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.+))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const stage = args.stage ?? 'river';
const bucket = args.bucket ?? 'BB_vs_LP_srp_reg';
const upload = !!args.upload;

if (!['river', 'turn', 'flop', 'multistreet', 'exploits', 'detection', 'all'].includes(stage)) {
  console.error('Only --stage=river|turn|flop|multistreet|exploits|detection|all is implemented.');
  process.exit(2);
}

console.log(`stage=${stage}  bucket=${bucket}  upload=${upload}`);

const all = await listAllBlobs();
console.log(`total blobs: ${all.length}`);

// Filter to the target matchup, both perspectives.
const wantedPrefixes = [`${bucket}_ip_`, `${bucket}_oop_`];
const targets = all
  .map(b => ({ blob: b, parsed: parseFilename(b.pathname) }))
  .filter(x => x.parsed && wantedPrefixes.some(p => x.blob.pathname.startsWith(p)));
console.log(`matched blobs in target bucket: ${targets.length}`);

const ipFiles = new Map(), oopFiles = new Map();
for (const t of targets) {
  const map = t.parsed.perspective === 'ip' ? ipFiles : oopFiles;
  map.set(t.parsed.line, t);
}
console.log(`ip lines: ${ipFiles.size}  oop lines: ${oopFiles.size}`);

const riverIpLines  = [...ipFiles.keys()].filter(isRiverBetLine);
const riverOopLines = [...oopFiles.keys()].filter(isRiverBetLine);
console.log(`river-bet lines: ip=${riverIpLines.length}  oop=${riverOopLines.length}`);

async function build(perspective, fileMap, lines) {
  const bucketKey = `${bucket}_${perspective}`;
  const out = {
    bucket: bucketKey,
    stage: 'river',
    generated_at: new Date().toISOString(),
    params: { min_response_sample: 100, sizing_buckets: ['25','33','50','75','100','150','200+'] },
    bet_nodes: {},
    facing_nodes: {},
  };

  // 1. Bet nodes — perspective's own files where perspective bet the river.
  for (const line of lines) {
    const t = fileMap.get(line);
    const file = await readBlob(t.blob);
    const node = buildRiverBetNode({ bucketKey, line, file });
    if (node) out.bet_nodes[line] = node;
  }

  // 2. Facing nodes — pulled from the *other* perspective's same lines.
  // If villain (other perspective) bet on line L, hero on the same physical
  // game state faced that bet. Read villain's file; we already loaded mirrors
  // in the other map elsewhere — just call build() twice.
  return out;
}

async function buildBoth() {
  const ipBet  = await build('ip',  ipFiles,  riverIpLines);
  const oopBet = await build('oop', oopFiles, riverOopLines);

  // Cross-fill facing_nodes: hero=ip facing villain=oop's bet → read oop's file.
  for (const line of riverOopLines) {
    const t = oopFiles.get(line);
    const file = await readBlob(t.blob);
    const node = buildRiverFacingNode({
      bucketKey: `${bucket}_ip`,
      line: `mirror:${line}`,
      file,
      mirrorLine: line,
    });
    if (node) ipBet.facing_nodes[line] = node;
  }
  for (const line of riverIpLines) {
    const t = ipFiles.get(line);
    const file = await readBlob(t.blob);
    const node = buildRiverFacingNode({
      bucketKey: `${bucket}_oop`,
      line: `mirror:${line}`,
      file,
      mirrorLine: line,
    });
    if (node) oopBet.facing_nodes[line] = node;
  }

  return { ip: ipBet, oop: oopBet };
}

function writeOut(name, obj) {
  const path = join('out', name);
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
  console.log(`wrote ${path}  (${(Buffer.byteLength(JSON.stringify(obj))/1024).toFixed(0)} KB raw)`);
}

async function runRiver() {
  const { ip, oop } = await buildBoth();
  writeOut(`river_${bucket}_ip.json`,  ip);
  writeOut(`river_${bucket}_oop.json`, oop);
  if (upload) {
    const r1 = await writeStrategyBlob(`river_${bucket}_ip.json`,  ip);
    const r2 = await writeStrategyBlob(`river_${bucket}_oop.json`, oop);
    console.log('uploaded:', r1.filename, r2.filename);
  }
  return { ip, oop };
}

async function runTurn() {
  // Stage 4 depends on Stage 3 artifact on disk.
  const ipRiver  = JSON.parse(readFileSync(join('out', `river_${bucket}_ip.json`),  'utf8'));
  const oopRiver = JSON.parse(readFileSync(join('out', `river_${bucket}_oop.json`), 'utf8'));

  async function buildTurn(perspective, fileMap, riverArtifact) {
    const bucketKey = `${bucket}_${perspective}`;
    const out = {
      bucket: bucketKey,
      stage: 'turn',
      generated_at: new Date().toISOString(),
      params: { min_response_sample: 100, sizing_buckets: ['25','33','50','75','100','150','200+'] },
      bet_nodes: {},
    };
    const lines = [...fileMap.keys()].filter(isTurnBetLine);
    for (const line of lines) {
      const t = fileMap.get(line);
      const file = await readBlob(t.blob);
      const node = buildTurnBetNode({ bucketKey, line, file, riverArtifact, perspective });
      if (node) out.bet_nodes[line] = node;
    }
    return out;
  }

  const ipTurn  = await buildTurn('ip',  ipFiles,  ipRiver);
  const oopTurn = await buildTurn('oop', oopFiles, oopRiver);
  writeOut(`turn_${bucket}_ip.json`,  ipTurn);
  writeOut(`turn_${bucket}_oop.json`, oopTurn);
  if (upload) {
    const r1 = await writeStrategyBlob(`turn_${bucket}_ip.json`,  ipTurn);
    const r2 = await writeStrategyBlob(`turn_${bucket}_oop.json`, oopTurn);
    console.log('uploaded:', r1.filename, r2.filename);
  }
  return { ip: ipTurn, oop: oopTurn };
}

async function runFlop() {
  const ipTurn  = JSON.parse(readFileSync(join('out', `turn_${bucket}_ip.json`),  'utf8'));
  const oopTurn = JSON.parse(readFileSync(join('out', `turn_${bucket}_oop.json`), 'utf8'));

  async function buildFlop(perspective, fileMap, turnArtifact) {
    const bucketKey = `${bucket}_${perspective}`;
    const out = {
      bucket: bucketKey,
      stage: 'flop',
      generated_at: new Date().toISOString(),
      params: { min_response_sample: 100, sizing_buckets: ['25','33','50','75','100','150','200+'] },
      bet_nodes: {},
    };
    const lines = [...fileMap.keys()].filter(isFlopBetLine);
    for (const line of lines) {
      const t = fileMap.get(line);
      const file = await readBlob(t.blob);
      const node = buildFlopBetNode({ bucketKey, line, file, turnArtifact, perspective });
      if (node) out.bet_nodes[line] = node;
    }
    return out;
  }

  const ipFlop  = await buildFlop('ip',  ipFiles,  ipTurn);
  const oopFlop = await buildFlop('oop', oopFiles, oopTurn);
  writeOut(`flop_${bucket}_ip.json`,  ipFlop);
  writeOut(`flop_${bucket}_oop.json`, oopFlop);
  if (upload) {
    const r1 = await writeStrategyBlob(`flop_${bucket}_ip.json`,  ipFlop);
    const r2 = await writeStrategyBlob(`flop_${bucket}_oop.json`, oopFlop);
    console.log('uploaded:', r1.filename, r2.filename);
  }
  return { ip: ipFlop, oop: oopFlop };
}

async function runMultistreet() {
  const stageOf = (p, s) => JSON.parse(readFileSync(join('out', `${s}_${bucket}_${p}.json`), 'utf8'));
  const ipRiver  = stageOf('ip',  'river');
  const oopRiver = stageOf('oop', 'river');
  const ipTurn   = stageOf('ip',  'turn');
  const oopTurn  = stageOf('oop', 'turn');
  const ipFlop   = stageOf('ip',  'flop');
  const oopFlop  = stageOf('oop', 'flop');

  function build(perspective, flopArt, turnArt, riverArt) {
    const bucketKey = `${bucket}_${perspective}`;
    const out = {
      bucket: bucketKey, stage: 'multistreet', generated_at: new Date().toISOString(),
      barrel_lines: {}, float_lines: {},
    };
    // Barrels: every flop-bet node.
    for (const line of Object.keys(flopArt.bet_nodes)) {
      out.barrel_lines[line] = buildBarrelScenario({
        flopNode: flopArt.bet_nodes[line],
        turnArtifact: turnArt,
        riverArtifact: riverArt,
        bucket: bucketKey, perspective,
      });
    }
    // Floats: every turn-bet node whose line is `<flopCall>-B` where flopCall
    // ends in C (perspective called) — derive flopCall from line.
    for (const line of Object.keys(turnArt.bet_nodes)) {
      const flopCall = line.slice(0, -2); // strip "-B"
      if (!flopCall || !/C$/.test(flopCall)) continue;
      const scen = buildFloatScenario({
        flopCallLine: flopCall, turnArtifact: turnArt, bucket: bucketKey, perspective,
      });
      if (scen) out.float_lines[flopCall] = scen;
    }
    return out;
  }

  const ipMs  = build('ip',  ipFlop,  ipTurn,  ipRiver);
  const oopMs = build('oop', oopFlop, oopTurn, oopRiver);
  writeOut(`multistreet_${bucket}_ip.json`,  ipMs);
  writeOut(`multistreet_${bucket}_oop.json`, oopMs);
  if (upload) {
    const r1 = await writeStrategyBlob(`multistreet_${bucket}_ip.json`,  ipMs);
    const r2 = await writeStrategyBlob(`multistreet_${bucket}_oop.json`, oopMs);
    console.log('uploaded:', r1.filename, r2.filename);
  }
  return { ip: ipMs, oop: oopMs };
}

let ip, oop;
if (stage === 'river') {
  ({ ip, oop } = await runRiver());
} else if (stage === 'turn') {
  ({ ip, oop } = await runTurn());
} else if (stage === 'flop') {
  ({ ip, oop } = await runFlop());
} else if (stage === 'multistreet') {
  ({ ip, oop } = await runMultistreet());
} else if (stage === 'exploits') {
  ({ ip, oop } = await runExploits());
} else if (stage === 'detection') {
  ({ ip, oop } = await runDetection());
} else if (stage === 'all') {
  await runRiver();
  await runTurn();
  await runFlop();
  await runMultistreet();
  await runExploits();
  ({ ip, oop } = await runDetection());
}

async function runDetection() {
  const exData = JSON.parse(readFileSync(join('out', `exploits_${bucket}.json`), 'utf8'));
  const annotated = annotateExploits(exData.ranked);
  const md = buildDetectionReport(annotated, 50);
  writeOut(`detection_${bucket}.json`, { bucket, generated_at: new Date().toISOString(), ranked: annotated });
  writeFileSync(join('out', `detection_${bucket}.md`), md);
  console.log(`wrote out/detection_${bucket}.md  (${md.length} chars)`);
  if (upload) {
    const r = await writeStrategyBlob(`detection_${bucket}.json`, { bucket, ranked: annotated });
    console.log('uploaded:', r.filename);
  }
  return { ip: { bet_nodes: {}, _exploits: annotated }, oop: { bet_nodes: {} } };
}

async function runExploits() {
  const stageOf = (p, s) => JSON.parse(readFileSync(join('out', `${s}_${bucket}_${p}.json`), 'utf8'));
  const both = {};
  for (const perspective of ['ip', 'oop']) {
    const exploits = buildExploits({
      bucket: `${bucket}_${perspective}`,
      perspective,
      riverArtifact:       stageOf(perspective, 'river'),
      turnArtifact:        stageOf(perspective, 'turn'),
      flopArtifact:        stageOf(perspective, 'flop'),
      multistreetArtifact: stageOf(perspective, 'multistreet'),
    });
    both[perspective] = exploits;
  }
  // Combined ranked list, top 50.
  const combined = [...both.ip, ...both.oop].sort((a,b) => b.priority_score - a.priority_score);
  const report = buildReport(combined, 50);

  writeOut(`exploits_${bucket}.json`, { bucket, generated_at: new Date().toISOString(), total: combined.length, ranked: combined });
  writeFileSync(join('out', `exploits_${bucket}.md`), report);
  console.log(`wrote out/exploits_${bucket}.md  (${report.length} chars)`);
  if (upload) {
    const r = await writeStrategyBlob(`exploits_${bucket}.json`, { bucket, generated_at: new Date().toISOString(), total: combined.length, ranked: combined });
    console.log('uploaded:', r.filename);
  }
  return { ip: { bet_nodes: {}, _exploits: both.ip }, oop: { bet_nodes: {}, _exploits: both.oop } };
}

// Summary
function summarise(label, doc) {
  console.log(`\n${label}`);
  if (doc.bet_nodes) {
    const bet = Object.values(doc.bet_nodes);
    const fac = doc.facing_nodes ? Object.values(doc.facing_nodes) : [];
    console.log(`  bet nodes: ${bet.length}`);
    if (fac.length) console.log(`  facing nodes: ${fac.length}`);
    const overfolds = bet.filter(n => n.pool_overall.overfold_pp > 10).length;
    console.log(`  bet nodes with >10pp overfold (overall): ${overfolds}`);
    if (stage === 'river') {
      const positiveBluff = bet.filter(n => (n.optimal_bluff_ev_bb ?? 0) > 0).length;
      console.log(`  bet nodes with any +EV bluff size: ${positiveBluff}`);
    } else {
      const positiveBluff = bet.filter(n => (n.optimal_bluff_ev_bb_incremental ?? 0) > 0).length;
      console.log(`  bet nodes with +EV bluff (incremental over check): ${positiveBluff}`);
    }
  } else if (doc.barrel_lines) {
    const b = Object.values(doc.barrel_lines);
    const f = Object.values(doc.float_lines);
    console.log(`  barrel scenarios: ${b.length}  float scenarios: ${f.length}`);
    const strats = {};
    for (const x of b) strats[x.recommended_strategy] = (strats[x.recommended_strategy] || 0) + 1;
    console.log(`  recommended barrel strategy distribution:`, strats);
  }
}

summarise('=== IP perspective ===', ip);
summarise('=== OOP perspective ===', oop);
