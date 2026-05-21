import { list } from '@vercel/blob';

const FILE_RE = /^([A-Za-z]+)_vs_([A-Za-z]+)_([a-z0-9]+)_([a-z]+)_(ip|oop)_(.+)\.json$/;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const blobs = await listAll();
  const uploads = {};

  for (const blob of blobs) {
    const m = blob.pathname.match(FILE_RE);
    if (!m) continue;
    const [, oop, ip, potType, playerType, perspective, line] = m;
    const key = `${oop}_vs_${ip}_${potType}_${playerType}_${perspective}`;
    if (!uploads[key]) uploads[key] = { oop, ip, potType, playerType, perspective, lines: [] };
    uploads[key].lines.push(line);
  }

  return res.status(200).json({ uploads });
}
