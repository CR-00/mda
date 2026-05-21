import { list, put } from '@vercel/blob';
import { parseBlobResponse, compressJson } from '../../../lib/blobJson.mjs';

const FILE_RE = /^([A-Za-z]+)_vs_([A-Za-z]+)_([a-z0-9]+)_([a-z]+)_(ip|oop)_(.+)\.json$/;

export async function listAllBlobs() {
  const out = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

export function parseFilename(pathname) {
  const m = pathname.match(FILE_RE);
  if (!m) return null;
  const [, oop, ip, potType, playerType, perspective, line] = m;
  return {
    oop, ip, potType, playerType, perspective,
    bucket: `${oop}_vs_${ip}_${potType}_${playerType}`,
    bucketWithPerspective: `${oop}_vs_${ip}_${potType}_${playerType}_${perspective}`,
    line,
    streetSegments: line.split('-').length,
  };
}

export async function readBlob(blob) {
  const res = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  return parseBlobResponse(res);
}

// Write strategy artifacts under strategy/ prefix.
export async function writeStrategyBlob(pathname, obj) {
  const filename = pathname.startsWith('strategy/') ? pathname : `strategy/${pathname}`;
  const r = await put(filename, compressJson(obj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return { filename, url: r.url };
}
