import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldScheduleCancelRetry } from './create-pending-client';

describe('shouldScheduleCancelRetry', () => {
  it('does not retry when Paycrest order is still fundable', () => {
    assert.equal(
      shouldScheduleCancelRetry({
        ok: false,
        status: 409,
        cancelled: false,
        code: 'PROVIDER_ORDER_STILL_LIVE',
      }),
      false,
    );
  });

  it('does not retry when already on-chain', () => {
    assert.equal(
      shouldScheduleCancelRetry({
        ok: false,
        status: 409,
        cancelled: false,
        code: 'ALREADY_ON_CHAIN',
      }),
      false,
    );
  });

  it('retries not_found once (race with create-pending)', () => {
    assert.equal(
      shouldScheduleCancelRetry({
        ok: true,
        status: 200,
        cancelled: false,
        reason: 'not_found',
      }),
      true,
    );
  });

  it('does not retry successful cancel', () => {
    assert.equal(
      shouldScheduleCancelRetry({
        ok: true,
        status: 200,
        cancelled: true,
      }),
      false,
    );
  });
});
