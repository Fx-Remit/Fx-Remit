process.env.CRON_SECRET ??= 'cron-test-secret';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ReconciliationService } from '@fx-remit/services';
import { GET } from './route';

afterEach(() => {
  mock.restoreAll();
});

describe('GET /api/cron/reconcile — happy paths', () => {
  it('runs reconciliation when bearer token matches', async () => {
    mock.method(ReconciliationService, 'reconcileStuckTransactions', async () => ({
      recovered: 1,
      flagged: 0,
      failed: 0,
    }));

    const res = await GET(
      new Request('http://localhost/api/cron/reconcile', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.results, { recovered: 1, flagged: 0, failed: 0 });
  });
});

describe('GET /api/cron/reconcile — unhappy paths', () => {
  it('returns 401 without bearer auth', async () => {
    const res = await GET(new Request('http://localhost/api/cron/reconcile'));
    assert.equal(res.status, 401);
  });

  it('returns 401 with wrong bearer token', async () => {
    const res = await GET(
      new Request('http://localhost/api/cron/reconcile', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    assert.equal(res.status, 401);
  });

  it('returns 500 when reconciliation throws', async () => {
    mock.method(ReconciliationService, 'reconcileStuckTransactions', async () => {
      throw new Error('db unavailable');
    });

    const res = await GET(
      new Request('http://localhost/api/cron/reconcile', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    assert.equal(res.status, 500);
  });
});
