import { put } from '@vercel/blob';
import { compressJson, prune } from '../../lib/blobJson.mjs';
import { normalizeSnapBody } from '../../lib/snapFormat';
import { isRiverLine } from '../../lib/lines';
import { uploadDataKey, isKnownSpotKey } from '../../lib/uploadKey';
import { isShortlisted } from '../../lib/shortlist';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = normalizeSnapBody(req.body);
  const matchup = body?.query?.matchups?.[0];
  const line = body?.query?.line;

  if (!matchup || !line) {
    return res.status(400).json({ error: 'Missing query.matchups[0] or query.line' });
  }

  if (!isRiverLine(line)) {
    return res.status(400).json({ error: `Only river nodes can be imported (got line "${line}")` });
  }

  const mode = body?._mode === 'advanced' ? 'advanced' : 'simple';
  const safeMatchup = uploadDataKey(body, mode);
  if (!safeMatchup) {
    return res.status(400).json({ error: 'Advanced mode needs an export of a single matchup (e.g. "BB vs BTN")' });
  }
  if (!isKnownSpotKey(safeMatchup)) {
    return res.status(400).json({ error: `${safeMatchup} isn't one of the app's ${mode} spots` });
  }
  if (!isShortlisted(safeMatchup, line)) {
    return res.status(400).json({ error: `Line "${line}" is not on the upload shortlist for ${safeMatchup}` });
  }

  const safeLine = line.replace(/[^A-Z0-9\-]/gi, '');
  const filename = `${safeMatchup}_${safeLine}.json`;

  await put(filename, compressJson(prune(body)), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });

  return res.status(200).json({
    filename,
    matchup,
    line,
    rowCount: body.data?.length ?? 0,
  });
}
