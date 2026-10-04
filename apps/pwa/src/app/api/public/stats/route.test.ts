import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PublicStatsService } from '@fx-remit/services';
import { GET, OPTIONS } from './route';

afterEach(() => {
  mock.restoreAll();
});

describe('GET /api/public/stats', () => {
  it('returns public stats with CORS and CDN caching', async () => {
    mock.method(PublicStatsService, 'loadAppCashOuts', async () => []);
    const res = await GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('cache-control') ?? '', /s-maxage=600/);
    const body = await res.json();
    assert.equal(body.bySource.legacyCelo.transactions, 107);
  });

  it('returns 503 when the database is unavailable', async () => {
    mock.method(PublicStatsService, 'loadAppCashOuts', async () => {
      throw new Error('db down');
    });
    const res = await GET();
    assert.equal(res.status, 503);
  });

  it('answers CORS preflight', () => {
    assert.equal(OPTIONS().status, 204);
  });
});
