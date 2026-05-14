import { put } from '@vercel/blob';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body;
  const matchup = body?.query?.matchups?.[0];
  const line = body?.query?.line;

  if (!matchup || !line) {
    return res.status(400).json({ error: 'Missing query.matchups[0] or query.line' });
  }

  const potType = body?._potType ?? (body?.query?.['Pot Type']?.[0] ?? '').toLowerCase().replace(/\s+/g, '');
  const playerType = (body?.query?.['Player Type']?.[0] ?? 'reg').toLowerCase().replace(/\s+/g, '');
  const perspective = (body?.query?.['IP/OOP']?.[0] ?? 'IP').toLowerCase() === 'oop' ? 'oop' : 'ip';

  const LP = new Set(['BTN', 'BU', 'CO']);
  const EP = new Set(['HJ', 'MP', 'LJ', 'UTG']);
  const [rawOop, , rawIp] = matchup.split(' ');
  const ipGroup = LP.has(rawIp) ? 'LP' : EP.has(rawIp) ? 'EP' : rawIp;
  const safeMatchup = `${rawOop}_vs_${ipGroup}` + (potType ? '_' + potType : '') + '_' + playerType + '_' + perspective;

  const safeLine = line.replace(/[^A-Z0-9\-]/gi, '');
  const filename = `${safeMatchup}_${safeLine}.json`;

  await put(filename, JSON.stringify(body), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  });

  return res.status(200).json({
    filename,
    matchup,
    line,
    rowCount: body.data?.length ?? 0,
  });
}
