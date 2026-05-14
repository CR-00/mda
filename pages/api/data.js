import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { matchup, line } = req.query;
  if (!matchup || !line) return res.status(400).json({ error: 'Missing params' });

  const filename = `${matchup}_${line}.json`;
  const { blobs } = await list({ prefix: filename });
  const blob = blobs.find(b => b.pathname === filename);

  if (!blob) return res.status(404).json({ error: 'No data for this spot' });

  const raw = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  return res.status(200).json(await raw.json());
}
