import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOrderIdCollision, newOrderId, withUniqueOrderId } from './order-id.js';

const collision = { code: 'P2002', meta: { target: ['order_id', 'chain_id'] } };

describe('order-id', () => {
  it('encodes the millisecond and three random digits', () => {
    const now = 1_790_000_000_123;
    const id = newOrderId(now);
    assert.equal(id / 1000n, BigInt(now));
    assert.ok(id % 1000n < 1000n);
  });

  it('ids from different milliseconds never clash', () => {
    const a = newOrderId(1_790_000_000_000);
    const b = newOrderId(1_790_000_000_001);
    assert.ok(b > a);
  });

  it('stays a safe JSON integer for centuries', () => {
    const year2200 = Date.UTC(2200, 0, 1);
    assert.ok(newOrderId(year2200) <= BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('spreads ids within one millisecond', () => {
    const seen = new Set<bigint>();
    for (let i = 0; i < 200; i++) seen.add(newOrderId(1_790_000_000_000));
    assert.ok(seen.size > 150);
  });

  it('detects order-id unique violations only', () => {
    assert.equal(isOrderIdCollision(collision), true);
    assert.equal(isOrderIdCollision({ code: 'P2002', meta: { target: ['chain_id', 'block_number', 'log_index'] } }), true);
    assert.equal(isOrderIdCollision({ code: 'P2002', meta: { target: ['external_id'] } }), false);
    assert.equal(isOrderIdCollision({ code: 'P2025' }), false);
    assert.equal(isOrderIdCollision(new Error('boom')), false);
  });

  it('retries with a new id after a collision', async () => {
    const ids: bigint[] = [];
    const result = await withUniqueOrderId(async (id) => {
      ids.push(id);
      if (ids.length === 1) throw collision;
      return 'created';
    });
    assert.equal(result, 'created');
    assert.equal(ids.length, 2);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    await assert.rejects(
      withUniqueOrderId(async () => {
        calls++;
        throw new Error('insufficient balance');
      }),
      /insufficient balance/,
    );
    assert.equal(calls, 1);
  });

  it('gives up after the attempt limit', async () => {
    let calls = 0;
    await assert.rejects(
      withUniqueOrderId(async () => {
        calls++;
        throw collision;
      }, 3),
    );
    assert.equal(calls, 3);
  });
});
