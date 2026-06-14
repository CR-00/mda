import { list } from '@vercel/blob';
import { parseBlobResponse } from '../../lib/blobJson.mjs';

export function adaptOverall(rows) {
  const overall = rows.find(r => r.metric === 'Overall');
  if (!overall) return null;
  const sizeRatio = overall.pctPot ?? 0;
  const bf = overall.nextActions?.BF ?? 0;
  const bc = overall.nextActions?.BC ?? 0;
  const br = overall.nextActions?.BR ?? 0;
  const total = bf + bc + br || 1;
  const nBF = bf / total, nBC = bc / total, nBR = br / total;
  return {
    bluffEV: overall.bluffVevPct ? overall.bluffVevPct * 100 : (nBF - nBC * sizeRatio) * 100,
    callEV: (overall.catchVevPct ?? 0) * 100,
    next: { bf: nBF, bc: nBC, br: nBR, hasBR: nBR > 0.01 },
    sample: overall.hits ?? 0,
    potSize: overall.pot ?? 0,
    sizeRatio,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { matchup } = req.query;
  if (!matchup) return res.status(400).json({ error: 'Missing matchup' });

  const prefix = matchup + '_';
  const { blobs } = await list({ prefix });

  const result = {};
  await Promise.all(blobs.map(async (blob) => {
    if (!blob.pathname.endsWith('.json')) return;
    const lineCode = blob.pathname.slice(prefix.length, -5);
    try {
      const raw = await parseBlobResponse(await fetch(blob.url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      }));
      const rows = Array.isArray(raw) ? raw : raw.data;
      if (!Array.isArray(rows)) return;
      const adapted = adaptOverall(rows);
      if (adapted) result[lineCode] = adapted;
    } catch {}
  }));

  return res.status(200).json({ result });
}
