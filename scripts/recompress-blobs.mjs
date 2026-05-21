#!/usr/bin/env node
// Re-fetch every stored blob, prune unused payload, recompress with Brotli,
// and write it back under the same name. Idempotent. Run via vite-node so it
// shares the exact prune/compress logic with the upload path:
//
//   npm run recompress           # dry run: report projected savings only
//   npm run recompress -- --apply  # actually rewrite the blobs
//
import { list, put } from '@vercel/blob';
import { compressJson, parseBlobResponse, prune } from '../lib/blobJson.mjs';

const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 5;
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN not set (run via `npm run recompress`).');
  process.exit(1);
}

async function listAll() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

let done = 0;
let oldTotal = 0;
let newTotal = 0;
const failures = [];

async function processBlob(blob) {
  try {
    const res = await fetch(blob.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const oldSize = Number(res.headers.get('content-length')) || blob.size || 0;
    const parsed = await parseBlobResponse(res);
    const payload = compressJson(prune(parsed));
    oldTotal += oldSize;
    newTotal += payload.length;
    if (APPLY) {
      await put(blob.pathname, payload, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    }
  } catch (err) {
    failures.push({ pathname: blob.pathname, error: String(err.message || err) });
  } finally {
    done++;
    if (done % 100 === 0) console.log(`  ${done} processed...`);
  }
}

async function run() {
  const all = await listAll();
  const blobs = all.filter(b => b.pathname.endsWith('.json'));
  console.log(`${APPLY ? 'REWRITING' : 'DRY RUN —'} ${blobs.length} blobs (of ${all.length} total)\n`);

  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, blobs.length) }, async () => {
      while (i < blobs.length) await processBlob(blobs[i++]);
    })
  );

  const gb = (n) => (n / 1024 / 1024 / 1024).toFixed(3) + ' GB';
  const pct = oldTotal ? (100 * (1 - newTotal / oldTotal)).toFixed(1) : '0';
  console.log(`\n${done - failures.length} ok, ${failures.length} failed`);
  console.log(`size: ${gb(oldTotal)} -> ${gb(newTotal)}  (${pct}% smaller)`);
  if (failures.length) {
    console.log('\nFailures (re-run to retry — idempotent):');
    for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f.pathname}: ${f.error}`);
    if (failures.length > 20) console.log(`  ...and ${failures.length - 20} more`);
  }
  if (!APPLY) console.log('\nNo changes written. Re-run with `-- --apply` to rewrite.');
}

run().catch(e => { console.error(e); process.exit(1); });
