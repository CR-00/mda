import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from '../pages/api/data.js';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data');

const req = (method, query) => ({ method, query });
const res = () => {
  const r = { _status: 200, _body: null };
  r.status = (code) => { r._status = code; return r; };
  r.json = (data) => { r._body = data; return r; };
  r.end = () => r;
  return r;
};

beforeAll(() => { process.env.DATA_DIR = FIXTURE_DIR; });
afterAll(() => { delete process.env.DATA_DIR; });

describe('GET /api/data', () => {
  it('serves an existing ip fixture file', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_srp_reg_ip', line: 'B' }), r);
    expect(r._status).toBe(200);
    expect(r._body).toHaveProperty('data');
    expect(Array.isArray(r._body.data)).toBe(true);
  });

  it('returned data contains an Overall row', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_srp_reg_ip', line: 'B' }), r);
    const overall = r._body.data.find(row => row.metric === 'Overall');
    expect(overall).toBeDefined();
    expect(overall.hits).toBeGreaterThan(0);
  });

  it('serves a different fixture correctly', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_3bp_fish_ip', line: 'B-B' }), r);
    expect(r._status).toBe(200);
    expect(r._body.data.find(row => row.metric === 'Overall')).toBeDefined();
  });

  it('returns 404 for a file that does not exist', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_srp_reg_ip', line: 'XRR-XRR-XRR' }), r);
    expect(r._status).toBe(404);
  });

  it('returns 404 when perspective is wrong', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_srp_reg_oop', line: 'B' }), r);
    expect(r._status).toBe(404);
  });

  it('returns 400 when matchup param is missing', () => {
    const r = res();
    handler(req('GET', { line: 'B' }), r);
    expect(r._status).toBe(400);
  });

  it('returns 400 when line param is missing', () => {
    const r = res();
    handler(req('GET', { matchup: 'BB_vs_LP_srp_reg_ip' }), r);
    expect(r._status).toBe(400);
  });

  it('returns 405 for non-GET requests', () => {
    const r = res();
    handler(req('POST', {}), r);
    expect(r._status).toBe(405);
  });
});
