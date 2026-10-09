process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.PAYOUT_FORWARDER_ADDRESS = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
process.env.RELAYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
process.env.BASE_RPC_URL ??= 'http://127.0.0.1:8545';

import { describe, it, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFunctionData,
  domainSeparator,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TransactionService } from '../transactions/transaction.service.js';
import { PAYCREST_SETTLEMENT } from '../paycrest/payout.service.js';
import { InstantSendWalletError } from './instant-send.broadcast.js';
import {
  broadcastForwarderPayout,
  forwarderAuthorizationNonce,
  forwarderDeps,
  isPayoutForwarderEnabledFor,
  PAYOUT_FORWARDER_ABI,
  PAYOUT_FORWARDER_V2_ABI,
  recoverStuckForwarderClaims,
  type ForwarderPublicClient,
} from './forwarder-payout.js';
import { prisma } from '@fx-remit/database';

const FORWARDER = getAddress('0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83');
const USDC = getAddress(PAYCREST_SETTLEMENT.tokenAddress);
const PAYER = getAddress('0x1111111111111111111111111111111111111111');
const SINK = getAddress('0x2222222222222222222222222222222222222222');
const RELAYER = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const ORDER = 1_790_000_000_000_123n;
const AMOUNT = 50_000_000n;
const PAYCREST_ID = 'pc-order-1';
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
// A valid 65-byte signature shape (r, s, v=27); the fake RPC never verifies it.
const SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex;

const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

afterEach(() => {
  mock.restoreAll();
});

function remittance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    userId: 'u1',
    orderId: ORDER,
    txHash: `pending-${PAYCREST_ID}`,
    amountUsd: { toString: () => '50' },
    externalId: 'ext-1',
    type: 'REMITTANCE',
    fundingPath: null,
    fundingTxHash: null,
    fundingTxRaw: null,
    ...overrides,
  } as never;
}

function settlement(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    order: {
      providerAccount: {
        receiveAddress: SINK,
        amountToTransfer: '50',
        validUntil: new Date(NOW + 30 * 60_000).toISOString(),
        ...overrides,
      },
    },
    settlement: { tokenAddress: USDC, decimals: 6 },
  } as never;
}

function log(address: Address, topics: Hex[], data: Hex) {
  return { address, topics, data } as never;
}

function receipt(
  opts: { status?: 'success' | 'reverted'; amount?: bigint; sink?: Address; forwarder?: Address } = {},
): TransactionReceipt {
  const amount = opts.amount ?? AMOUNT;
  const sink = opts.sink ?? SINK;
  const forwarder = opts.forwarder ?? FORWARDER;
  return {
    status: opts.status ?? 'success',
    logs: [
      log(USDC, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: PAYER, to: forwarder } }) as Hex[], encodeAbiParameters([{ type: 'uint256' }], [amount])),
      log(USDC, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: forwarder, to: sink } }) as Hex[], encodeAbiParameters([{ type: 'uint256' }], [amount])),
      log(
        forwarder,
        encodeEventTopics({ abi: PAYOUT_FORWARDER_ABI, eventName: 'PayoutFunded', args: { orderId: ORDER, payer: PAYER, sink } }) as Hex[],
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [USDC, amount]),
      ),
    ],
  } as unknown as TransactionReceipt;
}

/** A real signed relayer tx calling payout(ORDER, PAYER, SINK, AMOUNT, ...). */
async function signedPayoutTx(nonce = 7, validBefore = BigInt(Math.floor(NOW / 1000) + 600)): Promise<Hex> {
  const data = encodeFunctionData({
    abi: PAYOUT_FORWARDER_ABI,
    functionName: 'payout',
    args: [ORDER, PAYER, SINK, AMOUNT, validBefore, 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
  });
  return RELAYER.signTransaction({
    chainId: 8453,
    type: 'eip1559',
    to: FORWARDER,
    data,
    nonce,
    gas: 200_000n,
    maxFeePerGas: 10_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  });
}

type Fake = {
  client: ForwarderPublicClient;
  calls: { sent: Hex[]; dryRuns: number };
  receipts: Map<string, TransactionReceipt>;
};

function fakeChain(
  opts: {
    balance?: bigint;
    nonceLatest?: number;
    dryRunFails?: boolean;
    /** true/false for every forwarder, or per forwarder (V1 and V2 keep separate books). */
    funded?: boolean | ((forwarder: Address) => boolean);
    voided?: boolean;
  } = {},
): Fake {
  const calls = { sent: [] as Hex[], dryRuns: 0 };
  const receipts = new Map<string, TransactionReceipt>();
  const client: ForwarderPublicClient = {
    async readContract(args) {
      if (args.functionName === 'balanceOf') return opts.balance ?? AMOUNT;
      if (args.functionName === 'name') return 'USD Coin';
      if (args.functionName === 'DOMAIN_SEPARATOR') {
        return domainSeparator({ domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: args.address } });
      }
      return '2';
    },
    async call() {
      calls.dryRuns++;
      if (opts.dryRunFails) throw new Error('execution reverted');
      return {};
    },
    async getTransactionCount() {
      return opts.nonceLatest ?? 0;
    },
    async getTransactionReceipt({ hash }) {
      const r = receipts.get(hash);
      if (!r) throw new Error('not found');
      return r;
    },
    async sendRawTransaction({ serializedTransaction }) {
      calls.sent.push(serializedTransaction);
      return keccak256(serializedTransaction);
    },
  };
  mock.method(forwarderDeps, 'publicClient', () => client);
  mock.method(forwarderDeps, 'getReceipt', async (hash: Hex) => receipts.get(hash) ?? null);
  mock.method(forwarderDeps, 'sendRaw', async (raw: Hex) => {
    calls.sent.push(raw);
  });
  mock.method(forwarderDeps, 'withRelayerLock', async (fn: () => Promise<unknown>) => fn());
  mock.method(forwarderDeps, 'isFunded', async (forwarder: Address) =>
    typeof opts.funded === 'function' ? opts.funded(getAddress(forwarder)) : (opts.funded ?? false),
  );
  mock.method(forwarderDeps, 'isVoided', async () => opts.voided ?? false);
  mock.method(forwarderDeps, 'sleep', async () => {});
  let t = NOW;
  mock.method(forwarderDeps, 'now', () => (t += 5_000));
  return { client, calls, receipts };
}

function stubOrder(rem = remittance(), set = settlement()) {
  mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => rem);
  mock.method(forwarderDeps, 'getSettlement', async () => set);
  mock.method(forwarderDeps, 'resolveWallet', async () => ({ walletId: 'wallet-1', delegated: true }));
}

const run = () => broadcastForwarderPayout({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: PAYER, orderId: ORDER });

const code = (expected: string) => (err: unknown) => err instanceof InstantSendWalletError && err.code === expected;

describe('isPayoutForwarderEnabledFor', () => {
  it('is off unless flagged on or allowlisted', () => {
    delete process.env.PAYOUT_FORWARDER_ENABLED;
    process.env.PAYOUT_FORWARDER_ALLOWLIST = 'did:privy:tester, user-7';
    assert.equal(isPayoutForwarderEnabledFor({ id: 'u1', privyDid: 'did:privy:u1' }), false);
    assert.equal(isPayoutForwarderEnabledFor({ id: 'u1', privyDid: 'did:privy:tester' }), true);
    assert.equal(isPayoutForwarderEnabledFor({ id: 'user-7', privyDid: 'x' }), true);
    process.env.PAYOUT_FORWARDER_ENABLED = 'true';
    assert.equal(isPayoutForwarderEnabledFor({ id: 'u1', privyDid: 'did:privy:u1' }), true);
    delete process.env.PAYOUT_FORWARDER_ENABLED;
    delete process.env.PAYOUT_FORWARDER_ALLOWLIST;
  });

  it('is off when the relayer key is missing', () => {
    const key = process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PRIVATE_KEY;
    process.env.PAYOUT_FORWARDER_ENABLED = 'true';
    assert.equal(isPayoutForwarderEnabledFor({ id: 'u1', privyDid: 'd' }), false);
    process.env.RELAYER_PRIVATE_KEY = key;
    delete process.env.PAYOUT_FORWARDER_ENABLED;
  });
});

describe('broadcastForwarderPayout: before anything is signed', () => {
  it('reports FORWARDER_UNAVAILABLE (never the code that makes the client fall back to a user-paid send)', async () => {
    stubOrder();
    const key = process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PRIVATE_KEY;
    try {
      await assert.rejects(run, code('FORWARDER_UNAVAILABLE'));
    } finally {
      process.env.RELAYER_PRIVATE_KEY = key;
    }
  });

  it('says "may have been sent" when the env goes missing while a send is in flight', async () => {
    stubOrder(remittance({ txHash: `broadcasting-${PAYCREST_ID}`, fundingPath: 'forwarder', fundingTxHash: '0x01', fundingTxRaw: '0x02' }));
    const key = process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PRIVATE_KEY;
    try {
      await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    } finally {
      process.env.RELAYER_PRIVATE_KEY = key;
    }
  });

  it('still reports an already-funded order when the forwarder env is missing', async () => {
    const hash = `0x${'cd'.repeat(32)}`;
    stubOrder(remittance({ txHash: hash, fundingPath: 'forwarder' }));
    const key = process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PRIVATE_KEY;
    try {
      assert.deepEqual(await run(), { txHash: hash, alreadyBroadcast: true });
    } finally {
      process.env.RELAYER_PRIVATE_KEY = key;
    }
  });

  it('returns the attached hash when the order is already funded', async () => {
    const hash = `0x${'ab'.repeat(32)}`;
    stubOrder(remittance({ txHash: hash }));
    assert.deepEqual(await run(), { txHash: hash, alreadyBroadcast: true });
  });

  it('refuses an order that already started on the direct path', async () => {
    stubOrder(remittance({ fundingPath: 'direct' }));
    await assert.rejects(run, code('FUNDING_PATH_MISMATCH'));
  });

  it('refuses when Paycrest gives no amount (never substitutes the ledger amount)', async () => {
    fakeChain();
    stubOrder(remittance(), settlement({ amountToTransfer: undefined }));
    await assert.rejects(run, code('PAYCREST_AMOUNT_MISSING'));
  });

  it('refuses when Paycrest asks for more than the ledger reserved', async () => {
    fakeChain();
    stubOrder(remittance(), settlement({ amountToTransfer: '50.25' }));
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    await assert.rejects(run, code('AMOUNT_MISMATCH'));
    assert.equal(claim.mock.callCount(), 0);
  });

  it('refuses an order about to expire', async () => {
    fakeChain();
    stubOrder(remittance(), settlement({ validUntil: new Date(NOW + 60_000).toISOString() }));
    await assert.rejects(run, code('ORDER_EXPIRING'));
  });

  it('refuses when the wallet holds less than the amount', async () => {
    fakeChain({ balance: AMOUNT - 1n });
    stubOrder();
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    await assert.rejects(run, code('INSUFFICIENT_USDC'));
    assert.equal(claim.mock.callCount(), 0);
  });
});

describe('broadcastForwarderPayout: sending', () => {
  it('signs only this order, saves the relayer tx before broadcast, verifies the receipt, then attaches', async () => {
    const chain = fakeChain();
    stubOrder();
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const events: string[] = [];
    let typedData: any;
    mock.method(forwarderDeps, 'signAuthorization', async (_w: string, td: unknown) => {
      typedData = td;
      return SIGNATURE;
    });
    const raw = await signedPayoutTx();
    mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    mock.method(TransactionService, 'saveFundingTx', async () => {
      events.push('save');
      return true;
    });
    mock.method(forwarderDeps, 'sendRaw', async () => {
      events.push('send');
      chain.receipts.set(keccak256(raw), receipt());
    });
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    const result = await run();

    assert.deepEqual(result, { txHash: keccak256(raw), alreadyBroadcast: false });
    assert.deepEqual(events, ['save', 'send']);
    assert.equal((claim.mock.calls[0].arguments[0] as { fundingPath: string }).fundingPath, 'forwarder');
    assert.equal(typedData.primary_type, 'ReceiveWithAuthorization');
    assert.equal(getAddress(typedData.message.to), FORWARDER);
    assert.equal(typedData.message.value, AMOUNT.toString());
    assert.equal(typedData.message.nonce, forwarderAuthorizationNonce(ORDER, SINK));
    assert.equal(typedData.domain.verifyingContract, USDC);
    assert.equal(chain.calls.dryRuns, 1);
    assert.equal((attach.mock.calls[0].arguments[0] as { txHash: string }).txHash, keccak256(raw));
  });

  it('accepts a signature in yParity form (last byte 0/1)', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => `0x${'11'.repeat(32)}${'22'.repeat(32)}00` as Hex);
    let payoutData: Hex | undefined;
    mock.method(forwarderDeps, 'signRelayerTx', async (_to: Address, data: Hex) => {
      payoutData = data;
      throw new Error('stop after building calldata');
    });
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);

    await assert.rejects(run, code('FORWARDER_UNAVAILABLE'));
    const expected = encodeFunctionData({
      abi: PAYOUT_FORWARDER_ABI,
      functionName: 'payout',
      args: [ORDER, PAYER, SINK, AMOUNT, 0n, 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
    });
    // Same selector + args except validBefore: compare v (the 6th word) directly.
    const word = (d: Hex, i: number) => d.slice(10 + i * 64, 10 + (i + 1) * 64);
    assert.equal(word(payoutData!, 5), word(expected, 5));
  });

  it('releases the claim and sends nothing when the wallet refuses to sign', async () => {
    const chain = fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => {
      throw new Error('policy violation');
    });
    const save = mock.method(TransactionService, 'saveFundingTx', async () => true);

    await assert.rejects(run, code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(release.mock.callCount(), 1);
    assert.equal(save.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('keeps the claim and signs nothing when the order is already funded on-chain', async () => {
    const chain = fakeChain({ funded: true });
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    const sign = mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(sign.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('keeps the claim when the dry run fails because someone else funded the order meanwhile', async () => {
    fakeChain({ dryRunFails: true });
    stubOrder();
    let reads = 0;
    mock.method(forwarderDeps, 'isFunded', async () => ++reads > 1);
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(release.mock.callCount(), 0);
  });

  it('unpins the path when releasing before anything was sent', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => {
      throw new Error('policy violation');
    });

    await assert.rejects(run, code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal((release.mock.calls[0].arguments[0] as { resetFundingPath?: boolean }).resetFundingPath, true);
  });

  it('never says "nothing moved" when the release did not happen', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => false);
    mock.method(forwarderDeps, 'signAuthorization', async () => {
      throw new Error('policy violation');
    });

    await assert.rejects(run, code('BROADCAST_IN_PROGRESS'));
  });

  it('releases the claim when the dry run fails, before any gas is spent', async () => {
    const chain = fakeChain({ dryRunFails: true });
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);

    await assert.rejects(run, code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(release.mock.callCount(), 1);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('keeps the claim when the broadcast result is unknown', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    mock.method(forwarderDeps, 'signRelayerTx', async () => signedPayoutTx());
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      throw new Error('socket hang up');
    });

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(release.mock.callCount(), 0);
  });

  it('retires a reverted tx so the order can be funded again', async () => {
    const chain = fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const raw = await signedPayoutTx();
    mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      chain.receipts.set(keccak256(raw), receipt({ status: 'reverted' }));
    });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    await assert.rejects(run, code('PAYOUT_REVERTED'));
    assert.equal(discard.mock.callCount(), 1);
    assert.equal(attach.mock.callCount(), 0);
  });

  it('never retires a reverted tx when the contract says the order is funded', async () => {
    const chain = fakeChain({ funded: true });
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const raw = await signedPayoutTx();
    mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      chain.receipts.set(keccak256(raw), receipt({ status: 'reverted' }));
    });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
  });

  it('treats an RPC error while waiting for the receipt as uncertain, not as not-found', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    mock.method(forwarderDeps, 'signRelayerTx', async () => signedPayoutTx());
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'getReceipt', async () => {
      throw new Error('upstream 503');
    });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 0);
  });

  it('still returns the hash when attaching fails after a confirmed payout', async () => {
    const chain = fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const raw = await signedPayoutTx();
    mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      chain.receipts.set(keccak256(raw), receipt());
    });
    mock.method(TransactionService, 'attachOnChainHash', async () => {
      throw new Error('db blip');
    });

    assert.deepEqual(await run(), { txHash: keccak256(raw), alreadyBroadcast: false });
  });

  it('does not attach when the receipt does not show this payout', async () => {
    const chain = fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const raw = await signedPayoutTx();
    mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      chain.receipts.set(keccak256(raw), receipt({ sink: getAddress('0x3333333333333333333333333333333333333333') }));
    });
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(attach.mock.callCount(), 0);
  });

  it('reports uncertain, keeping the claim, when no receipt arrives in time', async () => {
    fakeChain();
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    mock.method(forwarderDeps, 'signRelayerTx', async () => signedPayoutTx());
    mock.method(TransactionService, 'saveFundingTx', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(release.mock.callCount(), 0);
  });
});

describe('broadcastForwarderPayout: resuming a saved tx', () => {
  const EXPIRED = BigInt(Math.floor(NOW / 1000) - 3600);

  async function stubSaved(nonce = 7, validBefore?: bigint) {
    const raw = await signedPayoutTx(nonce, validBefore);
    stubOrder(
      remittance({
        txHash: `broadcasting-${PAYCREST_ID}`,
        fundingPath: 'forwarder',
        fundingTxHash: keccak256(raw),
        fundingTxRaw: raw,
      }),
    );
    const sign = mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const signTx = mock.method(forwarderDeps, 'signRelayerTx', async () => raw);
    return { raw, sign, signTx };
  }

  it('attaches when the saved tx already landed, without signing anything new', async () => {
    const chain = fakeChain();
    const { raw, sign, signTx } = await stubSaved();
    chain.receipts.set(keccak256(raw), receipt());
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    assert.deepEqual(await run(), { txHash: keccak256(raw), alreadyBroadcast: false });
    assert.equal(attach.mock.callCount(), 1);
    assert.equal(sign.mock.callCount(), 0);
    assert.equal(signTx.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('rebroadcasts the same saved payload when the tx was dropped', async () => {
    const chain = fakeChain({ nonceLatest: 7 });
    const { raw, signTx } = await stubSaved(7);
    mock.method(forwarderDeps, 'sendRaw', async (r: Hex) => {
      chain.calls.sent.push(r);
      chain.receipts.set(keccak256(r), receipt());
    });
    mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    await run();
    assert.deepEqual(chain.calls.sent, [raw]);
    assert.equal(signTx.mock.callCount(), 0);
  });

  it('never retires an unexpired saved tx, even when the relayer nonce looks used (lagging node)', async () => {
    const chain = fakeChain({ nonceLatest: 8 });
    const { raw } = await stubSaved(7);
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
    assert.deepEqual(chain.calls.sent, [raw]);
  });

  it('keeps the claim when the authorization expired but the contract says the order is funded', async () => {
    const chain = fakeChain({ funded: true });
    await stubSaved(7, EXPIRED);
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('keeps the claim when the receipt lookup errors during resume', async () => {
    fakeChain();
    await stubSaved(7, EXPIRED);
    mock.method(forwarderDeps, 'getReceipt', async () => {
      throw new Error('rate limited');
    });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
  });

  it('reports in-progress, never "nothing sent", when another request already retired the tx', async () => {
    fakeChain();
    await stubSaved(7, EXPIRED);
    mock.method(TransactionService, 'discardFundingTx', async () => false);

    await assert.rejects(run, code('BROADCAST_IN_PROGRESS'));
  });

  it('retires the saved tx once its authorization expired and the contract says unfunded', async () => {
    const chain = fakeChain();
    await stubSaved(7, EXPIRED);
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);

    await assert.rejects(run, code('PAYOUT_DROPPED'));
    assert.equal(discard.mock.callCount(), 1);
    assert.equal(chain.calls.sent.length, 0);
  });
});

describe('recoverStuckForwarderClaims (nightly / ops)', () => {
  const EXPIRED = BigInt(Math.floor(NOW / 1000) - 3600);
  const originalFindMany = prisma.transaction.findMany;
  afterEach(() => {
    prisma.transaction.findMany = originalFindMany;
  });

  async function stuckRow(opts: { saved?: boolean; validBefore?: bigint } = {}) {
    const raw = opts.saved === false ? null : await signedPayoutTx(7, opts.validBefore);
    prisma.transaction.findMany = mock.fn(async () => [
      {
        userId: 'u1',
        orderId: ORDER,
        txHash: `broadcasting-${PAYCREST_ID}`,
        fundingTxHash: raw ? keccak256(raw) : null,
        fundingTxRaw: raw,
      },
    ]) as any;
    return raw;
  }

  const outcome = async () => {
    const res = await recoverStuckForwarderClaims();
    assert.ok(!('skipped' in res));
    return res.results[0]?.outcome;
  };

  it('skips when the forwarder is not configured', async () => {
    const key = process.env.RELAYER_PRIVATE_KEY;
    delete process.env.RELAYER_PRIVATE_KEY;
    try {
      const res = await recoverStuckForwarderClaims();
      assert.ok('skipped' in res);
    } finally {
      process.env.RELAYER_PRIVATE_KEY = key;
    }
  });

  it('attaches a saved tx that landed after the request gave up', async () => {
    const chain = fakeChain();
    const raw = (await stuckRow())!;
    chain.receipts.set(keccak256(raw), receipt());
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);
    assert.equal(await outcome(), 'attached');
    assert.equal((attach.mock.calls[0].arguments[0] as { txHash: string }).txHash, keccak256(raw));
  });

  it('retires a reverted saved tx when the order is unfunded', async () => {
    const chain = fakeChain();
    const raw = (await stuckRow())!;
    chain.receipts.set(keccak256(raw), receipt({ status: 'reverted' }));
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'retired');
    assert.equal(discard.mock.callCount(), 1);
  });

  it('keeps a reverted saved tx for ops when the order is funded', async () => {
    const chain = fakeChain({ funded: true });
    const raw = (await stuckRow())!;
    chain.receipts.set(keccak256(raw), receipt({ status: 'reverted' }));
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'kept-for-ops');
    assert.equal(discard.mock.callCount(), 0);
  });

  it('resends an unmined saved tx that is still valid', async () => {
    const chain = fakeChain();
    const raw = (await stuckRow())!;
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'rebroadcast');
    assert.deepEqual(chain.calls.sent, [raw]);
    assert.equal(discard.mock.callCount(), 0);
  });

  it('waits, without resending, when the authorization just expired but the grace period has not passed', async () => {
    const chain = fakeChain();
    await stuckRow({ validBefore: BigInt(Math.floor(NOW / 1000) - 60) });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'waiting');
    assert.equal(chain.calls.sent.length, 0);
    assert.equal(discard.mock.callCount(), 0);
  });

  it('retires an unmined saved tx once its authorization expired and the order is unfunded', async () => {
    fakeChain();
    await stuckRow({ validBefore: EXPIRED });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'retired');
    assert.equal(discard.mock.callCount(), 1);
  });

  it('releases a claim with nothing saved when the order is unfunded', async () => {
    fakeChain();
    await stuckRow({ saved: false });
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    assert.equal(await outcome(), 'released');
    assert.equal((release.mock.calls[0].arguments[0] as { resetFundingPath?: boolean }).resetFundingPath, true);
  });

  it('keeps a claim with nothing saved when the order is funded', async () => {
    fakeChain({ funded: true });
    await stuckRow({ saved: false });
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    assert.equal(await outcome(), 'kept-for-ops');
    assert.equal(release.mock.callCount(), 0);
  });

  it('keeps the claim when the receipt lookup errors', async () => {
    fakeChain();
    await stuckRow();
    mock.method(forwarderDeps, 'getReceipt', async () => {
      throw new Error('rate limited');
    });
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    assert.equal(await outcome(), 'kept-for-ops');
    assert.equal(discard.mock.callCount(), 0);
  });
});

describe('broadcastForwarderPayout payout permission (#192)', () => {
  it('asks for a permission update before claiming when our signer lacks the payout policy', async () => {
    fakeChain();
    stubOrder();
    mock.method(forwarderDeps, 'policyStatus', async () => 'missing');
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    await assert.rejects(run(), code('PERMISSION_UPDATE_REQUIRED'));
    assert.equal(claim.mock.callCount(), 0);
  });

  it('carries on when the policy status cannot be read (signing decides)', async () => {
    fakeChain();
    stubOrder();
    mock.method(forwarderDeps, 'policyStatus', async () => 'unknown');
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => false);
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () => remittance());
    await assert.rejects(run(), code('BROADCAST_IN_PROGRESS'));
    assert.equal(claim.mock.callCount(), 1);
  });
});

describe('PayoutForwarderV2 (#191)', () => {
  const V2 = getAddress('0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5');
  const UNKNOWN = getAddress('0x9999999999999999999999999999999999999999');
  const originalFindMany = prisma.transaction.findMany;
  beforeEach(() => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
  });
  afterEach(() => {
    delete process.env.PAYOUT_FORWARDER_V2_ADDRESS;
    prisma.transaction.findMany = originalFindMany;
  });

  /** A real signed relayer tx calling V2's payoutWithAuthorization for this order. */
  async function signedV2Tx(nonce = 7, validBefore = BigInt(Math.floor(NOW / 1000) + 600)): Promise<Hex> {
    const data = encodeFunctionData({
      abi: PAYOUT_FORWARDER_V2_ABI,
      functionName: 'payoutWithAuthorization',
      args: [ORDER, PAYER, SINK, USDC, AMOUNT, validBefore, 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
    });
    return RELAYER.signTransaction({
      chainId: 8453,
      type: 'eip1559',
      to: V2,
      data,
      nonce,
      gas: 200_000n,
      maxFeePerGas: 10_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    });
  }

  const saved = (raw: Hex, overrides: Record<string, unknown> = {}) =>
    remittance({
      txHash: `broadcasting-${PAYCREST_ID}`,
      fundingPath: 'forwarder',
      fundingTxHash: keccak256(raw),
      fundingTxRaw: raw,
      ...overrides,
    });

  it('pins a new order to V2, has the wallet authorize V2, and sends payoutWithAuthorization', async () => {
    const chain = fakeChain();
    stubOrder();
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    let typedData: any;
    mock.method(forwarderDeps, 'signAuthorization', async (_w: string, td: unknown) => {
      typedData = td;
      return SIGNATURE;
    });
    const raw = await signedV2Tx();
    let sent: { to: Address; data: Hex } | undefined;
    mock.method(forwarderDeps, 'signRelayerTx', async (to: Address, data: Hex) => {
      sent = { to, data };
      return raw;
    });
    mock.method(TransactionService, 'saveFundingTx', async () => true);
    mock.method(forwarderDeps, 'sendRaw', async () => {
      chain.receipts.set(keccak256(raw), receipt({ forwarder: V2 }));
    });
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    const result = await run();

    assert.equal(result.txHash, keccak256(raw));
    assert.equal((claim.mock.calls[0].arguments[0] as { fundingContract?: string }).fundingContract, V2);
    assert.equal(getAddress(typedData.message.to), V2);
    assert.equal(typedData.message.nonce, forwarderAuthorizationNonce(ORDER, SINK));
    assert.equal(sent!.to, V2);
    const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_V2_ABI, data: sent!.data });
    assert.equal(call.functionName, 'payoutWithAuthorization');
    assert.deepEqual(call.args.slice(0, 5), [ORDER, PAYER, SINK, USDC, AMOUNT]);
    assert.equal(attach.mock.callCount(), 1);
  });

  it('keeps an order pinned to V1 on V1 after V2 is switched on', async () => {
    fakeChain();
    stubOrder(remittance({ fundingPath: 'forwarder', fundingContract: FORWARDER }));
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    let typedData: any;
    mock.method(forwarderDeps, 'signAuthorization', async (_w: string, td: unknown) => {
      typedData = td;
      return SIGNATURE;
    });
    let sent: { to: Address; data: Hex } | undefined;
    mock.method(forwarderDeps, 'signRelayerTx', async (to: Address, data: Hex) => {
      sent = { to, data };
      throw new Error('stop after building calldata');
    });
    mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);

    await assert.rejects(run, code('FORWARDER_UNAVAILABLE'));
    assert.equal((claim.mock.calls[0].arguments[0] as { fundingContract?: string }).fundingContract, FORWARDER);
    assert.equal(getAddress(typedData.message.to), FORWARDER);
    assert.equal(sent!.to, FORWARDER);
    assert.equal(decodeFunctionData({ abi: PAYOUT_FORWARDER_ABI, data: sent!.data }).functionName, 'payout');
  });

  it('never claims an order pinned to a contract this deploy does not know', async () => {
    fakeChain();
    stubOrder(remittance({ fundingContract: UNKNOWN }));
    const claim = mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    await assert.rejects(run, code('FORWARDER_UNAVAILABLE'));
    assert.equal(claim.mock.callCount(), 0);
  });

  it('checks V1 as well: keeps the claim and signs nothing when V1 already funded the order', async () => {
    const chain = fakeChain({ funded: (forwarder) => forwarder === FORWARDER });
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    const sign = mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);

    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(sign.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('keeps a voided order for ops, signing and sending nothing', async () => {
    const chain = fakeChain({ voided: true });
    stubOrder();
    mock.method(TransactionService, 'claimBroadcastSlot', async () => true);
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    const sign = mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);

    await assert.rejects(run, code('ORDER_VOIDED'));
    assert.equal(sign.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 0);
    assert.equal(chain.calls.sent.length, 0);
  });

  it('never retires a saved V2 tx while V1 reports the order funded', async () => {
    fakeChain({ funded: (forwarder) => forwarder === FORWARDER });
    const raw = await signedV2Tx(7, BigInt(Math.floor(NOW / 1000) - 3600));
    stubOrder(saved(raw, { fundingContract: V2 }));
    const discard = mock.method(TransactionService, 'discardFundingTx', async () => true);
    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(discard.mock.callCount(), 0);
  });

  it('resumes a saved V2 tx against the contract on the row and attaches it', async () => {
    const chain = fakeChain();
    const raw = await signedV2Tx();
    stubOrder(saved(raw, { fundingContract: V2 }));
    chain.receipts.set(keccak256(raw), receipt({ forwarder: V2 }));
    const sign = mock.method(forwarderDeps, 'signAuthorization', async () => SIGNATURE);
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    const result = await run();
    assert.equal(result.txHash, keccak256(raw));
    assert.equal(sign.mock.callCount(), 0);
    assert.equal(attach.mock.callCount(), 1);
  });

  it('reads a saved tx from before pinning as V1, even with V2 active', async () => {
    const chain = fakeChain();
    const raw = await signedPayoutTx();
    stubOrder(saved(raw, { fundingContract: null }));
    chain.receipts.set(keccak256(raw), receipt());
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);

    assert.equal((await run()).txHash, keccak256(raw));
    assert.equal(attach.mock.callCount(), 1);
  });

  it('keeps the claim when the saved tx went to a different contract than the row is pinned to', async () => {
    fakeChain();
    const raw = await signedPayoutTx(); // to V1
    stubOrder(saved(raw, { fundingContract: V2 }));
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);
    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(attach.mock.callCount(), 0);
  });

  it('keeps the claim when the pinned contract is no longer configured', async () => {
    fakeChain();
    const raw = await signedV2Tx();
    stubOrder(saved(raw, { fundingContract: V2 }));
    delete process.env.PAYOUT_FORWARDER_V2_ADDRESS;
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);
    await assert.rejects(run, code('BROADCAST_UNCERTAIN'));
    assert.equal(attach.mock.callCount(), 0);
  });

  it('recovery attaches a saved V2 tx and keeps a voided claim with nothing saved for ops', async () => {
    const chain = fakeChain();
    const raw = await signedV2Tx();
    chain.receipts.set(keccak256(raw), receipt({ forwarder: V2 }));
    prisma.transaction.findMany = mock.fn(async () => [
      { userId: 'u1', orderId: ORDER, txHash: `broadcasting-${PAYCREST_ID}`, fundingTxHash: keccak256(raw), fundingTxRaw: raw, fundingContract: V2 },
    ]) as any;
    mock.method(TransactionService, 'attachOnChainHash', async () => ({}) as never);
    let res = await recoverStuckForwarderClaims();
    assert.ok(!('skipped' in res));
    assert.equal(res.results[0]?.outcome, 'attached');

    mock.restoreAll();
    fakeChain({ voided: true });
    prisma.transaction.findMany = mock.fn(async () => [
      { userId: 'u1', orderId: ORDER, txHash: `broadcasting-${PAYCREST_ID}`, fundingTxHash: null, fundingTxRaw: null, fundingContract: V2 },
    ]) as any;
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    res = await recoverStuckForwarderClaims();
    assert.ok(!('skipped' in res));
    assert.equal(res.results[0]?.outcome, 'kept-for-ops');
    assert.equal(release.mock.callCount(), 0);
  });
});
