import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RpcClient } from './rpc.client.js';

afterEach(() => {
  mock.restoreAll();
  (RpcClient as any).clients = {};
});

describe('RpcClient — happy paths', () => {
  it('getBlockNumber uses public client for the chain', async () => {
    const getBlockNumber = mock.fn(async () => 12345n);
    mock.method(RpcClient, 'getClient', () => ({ getBlockNumber }));

    const block = await RpcClient.getBlockNumber(8453);
    assert.equal(block, 12345n);
    assert.equal(getBlockNumber.mock.callCount(), 1);
  });

  it('caches clients per chainId', () => {
    const a = RpcClient.getClient(8453);
    const b = RpcClient.getClient(8453);
    const c = RpcClient.getClient(42220);

    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe('RpcClient — unhappy paths', () => {
  it('propagates RPC transport errors from getBlockNumber', async () => {
    mock.method(RpcClient, 'getClient', () => ({
      getBlockNumber: async () => {
        throw new Error('RPC unavailable');
      },
    }));

    await assert.rejects(() => RpcClient.getBlockNumber(1), /RPC unavailable/);
  });
});
