import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default function handler(req, res) {
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

  // Map specific IP positions to LP/EP groups
  const LP = new Set(['BTN', 'BU', 'CO']);
  const EP = new Set(['HJ', 'MP', 'LJ', 'UTG']);
  const [rawOop, , rawIp] = matchup.split(' ');
  const ipGroup = LP.has(rawIp) ? 'LP' : EP.has(rawIp) ? 'EP' : rawIp;
  const safeMatchup = `${rawOop}_vs_${ipGroup}` + (potType ? '_' + potType : '') + '_' + playerType + '_' + perspective;

  const safeLine = line.replace(/[^A-Z0-9\-]/gi, '');
  const filename = `${safeMatchup}_${safeLine}.json`;

  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, filename), JSON.stringify(body));

  return res.status(200).json({
    filename,
    matchup,
    line,
    rowCount: body.data?.length ?? 0,
  });
}
