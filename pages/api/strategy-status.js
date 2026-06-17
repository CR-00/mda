import { list } from '@vercel/blob';

// Reports whether each strategy-backed page has any data uploaded, so the nav
// can disable links that would otherwise 404. Category-level (any bucket).
async function hasAny(prefix) {
  const { blobs } = await list({ prefix, limit: 1 });
  return blobs.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  // Match the prefixes each page actually reads: the Spot Browser is built from
  // the per-street strategy files (flop_/turn_/river_), not a single spots_ blob.
  const [spots, exploits, summary] = await Promise.all([
    hasAny('strategy/flop_'),
    hasAny('strategy/exploits_'),
    hasAny('strategy/summary_'),
  ]);
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ spots, exploits, summary });
}
