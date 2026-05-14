import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from '../pages/api/coverage.js';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data');

const req = (method = 'GET') => ({ method });
const res = () => {
  const r = { _status: 200, _body: null };
  r.status = (code) => { r._status = code; return r; };
  r.json = (data) => { r._body = data; return r; };
  r.end = () => r;
  return r;
};

beforeAll(() => { process.env.DATA_DIR = FIXTURE_DIR; });
afterAll(() => { delete process.env.DATA_DIR; });

describe('GET /api/coverage', () => {
  it('returns 200 with uploads object', () => {
    const r = res();
    handler(req(), r);
    expect(r._status).toBe(200);
    expect(r._body).toHaveProperty('uploads');
    expect(typeof r._body.uploads).toBe('object');
  });

  it('groups files by matchup+perspective key', () => {
    const r = res();
    handler(req(), r);
    const { uploads } = r._body;
    expect(uploads).toHaveProperty('BB_vs_LP_srp_reg_ip');
    expect(uploads).toHaveProperty('BB_vs_LP_3bp_fish_ip');
  });

  it('collects all lines for a matchup', () => {
    const r = res();
    handler(req(), r);
    const entry = r._body.uploads['BB_vs_LP_srp_reg_ip'];
    expect(entry.lines).toContain('B');
    expect(entry.lines).toContain('X');
    expect(entry.lines).toHaveLength(2);
  });

  it('parses matchup metadata correctly including perspective', () => {
    const r = res();
    handler(req(), r);
    const entry = r._body.uploads['BB_vs_LP_srp_reg_ip'];
    expect(entry.oop).toBe('BB');
    expect(entry.ip).toBe('LP');
    expect(entry.potType).toBe('srp');
    expect(entry.playerType).toBe('reg');
    expect(entry.perspective).toBe('ip');
  });

  it('separates different matchup keys', () => {
    const r = res();
    handler(req(), r);
    const { uploads } = r._body;
    expect(uploads['BB_vs_LP_srp_reg_ip']?.lines).not.toContain('B-B');
    expect(uploads['BB_vs_LP_3bp_fish_ip']?.lines).toContain('B-B');
  });

  it('returns 405 for non-GET', () => {
    const r = res();
    handler(req('POST'), r);
    expect(r._status).toBe(405);
  });
});
