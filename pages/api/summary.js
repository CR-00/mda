import { list } from '@vercel/blob';

// Returns the written AI strategy summary (markdown) for a bucket.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const bucket = req.query.bucket || 'BB_vs_LP_srp_reg';
  const filename = `strategy/summary_${bucket}.md`;

  const { blobs } = await list({ prefix: filename });
  const blob = blobs.find(b => b.pathname === filename);
  if (!blob) return res.status(404).json({ error: `no summary for ${bucket}` });

  const r = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!r.ok) return res.status(502).json({ error: `blob fetch ${r.status}` });
  const markdown = await r.text();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({ bucket, markdown });
}
