import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { matchup, line } = req.query;
  if (!matchup || !line) return res.status(400).json({ error: 'Missing params' });

  const filename = `${matchup}_${line}.json`;
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  const filepath = path.join(dir, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'No data for this spot' });
  }

  const raw = fs.readFileSync(filepath, 'utf8');
  return res.status(200).json(JSON.parse(raw));
}
