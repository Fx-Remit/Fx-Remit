process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.PAYOUT_FORWARDER_ADDRESS = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
process.env.PAYOUT_FORWARDER_V2_ADDRESS = '0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5';
process.env.RELAYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
process.env.BASE_RPC_URL ??= 'http://127.0.0.1:8545';
process.env.CELO_RPC_URL ??= 'http://127.0.0.1:8546';
process.env.PAYOUT_FORWARDER_CHAINS = '8453,42220';

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  keccak256,
  maxUint256,
  parseAbi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../transactions/transaction.service.js';
import { CryptoAddressService } from '../crypto-addresses/crypto-address.service.js';
import { InstantSendWalletError } from './instant-send.broadcast.js';
import {
  broadcastForwarderCryptoTransfer,
  cryptoFundingPathFor,
  forwarderDeps,
  forwarderTokenNeedsApproval,
  PAYOUT_FORWARDER_ABI,
  PAYOUT_FORWARDER_V2_ABI,
  prepareCryptoAuthorization,
  prepareForwarderApproval,
  type ForwarderPublicClient,
} from './forwarder-payout.js';

const V1 = getAddress('0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83');
const V2 = getAddress('0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5');
const BASE_USDT = getAddress('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2');
const PAYER = getAddress('0x1111111111111111111111111111111111111111');
const DEST = getAddress('0x3333333333333333333333333333333333333333');
const RELAYER = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const ORDER = 1_790_000_000_000_888n;
const AMOUNT = 50_000_000n;
const KEY = 'crypto_1790000000000_usdt888';
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const NOW_S = BigInt(Math.floor(NOW / 1000));
const SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex;
const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const PAYOUT_TYPES = {
  Payout: [
    { name: 'orderId', type: 'uint256' },
    { name: 'payer', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'sink', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

const drips = {
  findUnique: prisma.relayerDrip.findUnique,
  create: prisma.relayerDrip.create,
  update: prisma.relayerDrip.update,
  delete: prisma.relayerDrip.delete,
  deleteMany: prisma.relayerDrip.deleteMany,
};
afterEach(() => {
  mock.restoreAll();
  Object.assign(prisma.relayerDrip, drips);
});

function usdtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-u1',
    userId: 'u1',
    orderId: ORDER,
    txHash: `pending-${KEY}`,
    status: 'PENDING',
    amountUsd: { toString: () => '50' },
    externalId: KEY,
    type: 'REMITTANCE',
    sourceToken: 'USDT',
    recipientBank: 'crypto:base',
    recipientAcc: DEST.toLowerCase(),
    fundingPath: null,
    fundingContract: null,
    fundingTxHash: null,
    fundingTxRaw: null,
    ...overrides,
  } as never;
}

function log(address: Address, topics: Hex[], data: Hex) {
  return { address, topics, data } as never;
}

/** PayoutFunded on V2 plus both USDT legs (payer → V2 → destination). */
function usdtReceipt(): TransactionReceipt {
  const amount = encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]);
  return {
    status: 'success',
    logs: [
      log(BASE_USDT, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: PAYER, to: V2 } }) as Hex[], amount),
      log(BASE_USDT, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: V2, to: DEST } }) as Hex[], amount),
      log(
        V2,
        encodeEventTopics({ abi: PAYOUT_FORWARDER_ABI, eventName: 'PayoutFunded', args: { orderId: ORDER, payer: PAYER, sink: DEST } }) as Hex[],
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [BASE_USDT, AMOUNT]),
      ),
    ],
  } as unknown as TransactionReceipt;
}

type Harness = {
  dryRuns: Hex[];
  typedData: Record<string, any>[];
  relayed: { to: Address; data: Hex; value?: bigint; hash: Hex }[];
  sent: Hex[];
  events: string[];
  claim: ReturnType<typeof mock.fn>;
  release: ReturnType<typeof mock.fn>;
  attach: ReturnType<typeof mock.fn>;
  receipts: Map<string, TransactionReceipt>;
};

function harness(
  opts: {
    row?: unknown;
    trusted?: boolean;
    allowance?: bigint;
    ethBalance?: bigint;
    maxFee?: bigint;
    /** The contract computes a different Payout digest than we do. */
    badDigest?: boolean;
    dryRunFails?: boolean;
  } = {},
): Harness {
  const h: Harness = {
    dryRuns: [],
    typedData: [],
    relayed: [],
    sent: [],
    events: [],
    claim: mock.fn(async () => true),
    release: mock.fn(async () => true),
    attach: mock.fn(async () => ({})),
    receipts: new Map(),
  };
  let nonce = 0;
  const client: ForwarderPublicClient = {
    async readContract(args) {
      if (args.functionName === 'balanceOf') return AMOUNT * 2n;
      if (args.functionName === 'allowance') return opts.allowance ?? maxUint256;
      if (args.functionName === 'payoutDigest') {
        if (opts.badDigest) return `0x${'ab'.repeat(32)}`;
        const [orderId, payer, token, sink, amount, validAfter, deadline] = args.args;
        return hashTypedData({
          domain: { name: 'FX Remit PayoutForwarder', version: '2', chainId: 8453, verifyingContract: args.address },
          types: PAYOUT_TYPES,
          primaryType: 'Payout',
          message: { orderId, payer, token, sink, amount, validAfter, deadline },
        });
      }
      return '2';
    },
    async call(args) {
      h.dryRuns.push(args.data);
      if (opts.dryRunFails) throw new Error('execution reverted');
      return {};
    },
    async getTransactionCount() {
      return 0;
    },
    async getTransactionReceipt() {
      throw new Error('not used');
    },
    async sendRawTransaction() {
      return '0x' as Hex;
    },
    async getBalance() {
      return opts.ethBalance ?? 10n ** 18n;
    },
    async getGasPrice() {
      return 5_000_000n;
    },
    async estimateFeesPerGas() {
      return { maxFeePerGas: opts.maxFee ?? 10_000_000n };
    },
    async estimateGas() {
      return 46_000n;
    },
  };
  mock.method(forwarderDeps, 'publicClient', () => client);
  mock.method(forwarderDeps, 'now', () => NOW);
  mock.method(forwarderDeps, 'sleep', async () => {});
  mock.method(forwarderDeps, 'isFunded', async () => false);
  mock.method(forwarderDeps, 'isVoided', async () => false);
  mock.method(forwarderDeps, 'withRelayerLock', async (fn: () => Promise<unknown>) => fn());
  mock.method(forwarderDeps, 'resolveWallet', async () => ({ walletId: 'wallet-1', delegated: true }));
  mock.method(forwarderDeps, 'policyStatus', async () => 'ok');
  mock.method(forwarderDeps, 'signAuthorization', async (_w: string, td: Record<string, any>) => {
    h.typedData.push(td);
    return SIGNATURE;
  });
  mock.method(forwarderDeps, 'signRelayerTx', async (to: Address, data: Hex, chainId: number = 8453, value?: bigint) => {
    const raw = await RELAYER.signTransaction({
      chainId,
      type: 'eip1559',
      to,
      data,
      value,
      nonce: nonce++,
      gas: 200_000n,
      maxFeePerGas: 10_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    });
    const hash = keccak256(raw);
    h.relayed.push({ to, data, value, hash });
    // Every relayer payout lands with the expected receipt.
    if (to === V2) h.receipts.set(hash, usdtReceipt());
    return raw;
  });
  mock.method(forwarderDeps, 'sendRaw', async (raw: Hex) => {
    h.events.push('send');
    h.sent.push(raw);
  });
  mock.method(forwarderDeps, 'getReceipt', async (hash: Hex) => h.receipts.get(hash) ?? null);

  mock.method(TransactionService, 'findRemittanceForBroadcast', async () => opts.row ?? usdtRow());
  mock.method(TransactionService, 'claimBroadcastSlot', h.claim);
  mock.method(TransactionService, 'releaseBroadcastClaim', h.release);
  mock.method(TransactionService, 'saveFundingTx', async () => true);
  mock.method(TransactionService, 'attachOnChainHash', h.attach);
  mock.method(CryptoAddressService, 'listForUser', async () =>
    opts.trusted === false ? [] : [{ network: 'base', address: DEST.toLowerCase(), fastPathEligible: true }],
  );
  mock.method(CryptoAddressService, 'markFirstConfirmed', async () => {});
  return h;
}

const send = (userAuthorization?: { signature: Hex; validBefore: string; validAfter?: string }) =>
  broadcastForwarderCryptoTransfer({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: PAYER, orderId: ORDER, userAuthorization });
const approval = () => prepareForwarderApproval({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
const code = (expected: string) => (err: unknown) => err instanceof InstantSendWalletError && err.code === expected;

describe('Base USDT through PayoutForwarderV2: payouts (#191)', () => {
  it("has the user sign V2's Payout and relays payoutWithApproval with exactly that window", async () => {
    const h = harness({ trusted: false });
    const prepared = await prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.equal(prepared.typedData.primaryType, 'Payout');
    assert.deepEqual(prepared.typedData.domain, { name: 'FX Remit PayoutForwarder', version: '2', chainId: 8453, verifyingContract: V2 });
    assert.equal(prepared.typedData.message.token, BASE_USDT);
    assert.equal(prepared.typedData.message.sink, DEST);
    assert.equal(prepared.typedData.message.amount, AMOUNT.toString());
    // Starts a minute back (clock skew), ends with the usual 10-minute TTL: well inside V2's hour.
    assert.equal(prepared.validAfter, String(NOW_S - 60n));
    assert.equal(prepared.validBefore, String(NOW_S + 600n));
    assert.equal(prepared.typedData.message.deadline, prepared.validBefore);

    const result = await send({ signature: SIGNATURE, validBefore: prepared.validBefore, validAfter: prepared.validAfter });
    assert.equal(h.typedData.length, 0);
    assert.equal((h.claim.mock.calls[0].arguments[0] as { fundingContract?: string }).fundingContract, V2);
    const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_V2_ABI, data: h.dryRuns[0] });
    assert.equal(call.functionName, 'payoutWithApproval');
    assert.deepEqual(call.args, [ORDER, PAYER, DEST, BASE_USDT, AMOUNT, NOW_S - 60n, NOW_S + 600n, SIGNATURE]);
    assert.equal(result.txHash, h.relayed[0].hash);
    assert.equal(h.attach.mock.callCount(), 1);
  });

  it('server-signs the Payout for a trusted address on a delegated wallet', async () => {
    const h = harness({ trusted: true });
    const result = await send();
    assert.equal(h.typedData[0].primary_type, 'Payout');
    assert.equal(h.typedData[0].domain.verifyingContract, V2);
    assert.ok(BigInt(h.typedData[0].message.deadline) - BigInt(h.typedData[0].message.validAfter) <= 3600n);
    assert.equal(result.txHash, h.relayed[0].hash);
  });

  it('asks for the one-time approval, before claiming, when the allowance is short', async () => {
    const h = harness({ trusted: true, allowance: AMOUNT - 1n });
    await assert.rejects(send(), code('APPROVAL_REQUIRED'));
    assert.equal(h.claim.mock.callCount(), 0);
    assert.equal(h.typedData.length, 0);
  });

  it('refuses, before claiming, a user window V2 would reject', async () => {
    const validBefore = String(NOW_S + 600n);
    const windows = [
      undefined, // validAfter missing
      String(NOW_S + 601n), // starts after it ends
      String(NOW_S + 600n - 3601n), // longer than an hour
    ];
    for (const validAfter of windows) {
      const h = harness({ trusted: false });
      await assert.rejects(send({ signature: SIGNATURE, validBefore, validAfter }), code('AUTHORIZATION_EXPIRED'));
      assert.equal(h.claim.mock.callCount(), 0);
      mock.restoreAll();
    }
  });

  it('never signs a Payout the contract would hash differently, and releases having sent nothing', async () => {
    const h = harness({ trusted: true, badDigest: true });
    await assert.rejects(send(), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(h.typedData.length, 0);
    assert.equal(h.relayed.length, 0);
    assert.equal(h.release.mock.callCount(), 1);
  });

  it('resumes a saved payoutWithApproval tx and attaches it, signing nothing new', async () => {
    const data = encodeFunctionData({
      abi: PAYOUT_FORWARDER_V2_ABI,
      functionName: 'payoutWithApproval',
      args: [ORDER, PAYER, DEST, BASE_USDT, AMOUNT, NOW_S - 60n, NOW_S + 600n, SIGNATURE],
    });
    const raw = await RELAYER.signTransaction({
      chainId: 8453, type: 'eip1559', to: V2, data, nonce: 9, gas: 200_000n, maxFeePerGas: 10_000_000n, maxPriorityFeePerGas: 1_000_000n,
    });
    const h = harness({
      row: usdtRow({
        txHash: `broadcasting-${KEY}`,
        fundingPath: 'forwarder',
        fundingContract: V2,
        fundingTxHash: keccak256(raw),
        fundingTxRaw: raw,
      }),
    });
    h.receipts.set(keccak256(raw), usdtReceipt());
    const result = await send();
    assert.equal(result.txHash, keccak256(raw));
    assert.equal(h.typedData.length, 0);
    assert.equal(h.relayed.length, 0);
    assert.equal(h.attach.mock.callCount(), 1);
  });

  it('refuses an order pinned to V1, which pays USDC only', async () => {
    const h = harness({ row: usdtRow({ fundingPath: 'forwarder', fundingContract: V1 }) });
    await assert.rejects(send(), code('FORWARDER_UNAVAILABLE'));
    assert.equal(h.claim.mock.callCount(), 0);
  });
});

describe('prepareForwarderApproval: the one-time approval and its gas (#191)', () => {
  const stubDrips = (existing: unknown = null) => {
    const calls = {
      create: mock.fn(async () => ({ id: 'drip-1' })),
      update: mock.fn(async () => ({})),
      delete: mock.fn(async () => ({})),
      deleteMany: mock.fn(async () => ({ count: 1 })),
    };
    let current = existing;
    prisma.relayerDrip.findUnique = mock.fn(async () => current) as any;
    prisma.relayerDrip.create = calls.create as any;
    prisma.relayerDrip.update = calls.update as any;
    prisma.relayerDrip.delete = calls.delete as any;
    prisma.relayerDrip.deleteMany = mock.fn(async () => {
      current = null;
      return { count: 1 };
    }) as any;
    calls.deleteMany = prisma.relayerDrip.deleteMany as any;
    return calls;
  };

  it('is approved once the wallet already allows V2 enough', async () => {
    harness({ allowance: AMOUNT });
    const drips = stubDrips();
    assert.deepEqual(await approval(), { status: 'approved' });
    assert.equal(drips.create.mock.callCount(), 0);
  });

  it('is a no-op for EIP-3009 tokens', async () => {
    harness({ row: usdtRow({ sourceToken: 'USDC' }), allowance: 0n });
    assert.deepEqual(await approval(), { status: 'approved' });
  });

  it("hands the wallet an unlimited approve of V2 when it can pay the gas itself", async () => {
    harness({ allowance: 0n });
    const drips = stubDrips();
    const step = await approval();
    assert.equal(step.status, 'approve');
    if (step.status !== 'approve') return;
    assert.equal(step.tx.to, BASE_USDT);
    assert.equal(step.tx.chainId, 8453);
    const call = decodeFunctionData({ abi: parseAbi(['function approve(address,uint256) returns (bool)']), data: step.tx.data });
    assert.deepEqual(call.args, [V2, maxUint256]);
    assert.equal(drips.create.mock.callCount(), 0);
  });

  it('sends the gas once when the wallet has none: recorded and hashed before broadcast', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    const drips = stubDrips();
    drips.update.mock.mockImplementation(async (args: any) => {
      h.events.push(`saved:${args.data.txHash}`);
      return {};
    });
    const step = await approval();
    assert.equal(step.status, 'funding');
    assert.equal(drips.create.mock.callCount(), 1);
    const created = (drips.create.mock.calls[0].arguments as any[])[0].data;
    assert.deepEqual([created.userId, created.chainId, created.token, created.wallet], ['u1', 8453, 'USDT', PAYER]);
    // 46k gas × 0.01 gwei, doubled for Base's L1 fee and again for headroom, is below the floor.
    assert.equal(h.relayed[0].to, PAYER);
    assert.equal(h.relayed[0].value, 5_000_000_000_000n);
    assert.equal(created.amountWei, '5000000000000');
    assert.deepEqual(h.events, [`saved:${h.relayed[0].hash}`, 'send']);
    if (step.status === 'funding') assert.equal(step.dripTxHash, h.relayed[0].hash);
  });

  it('never drips twice: a landed drip with the gas gone asks the user to top up', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    const landed = `0x${'cd'.repeat(32)}` as Hex;
    h.receipts.set(landed, { status: 'success', logs: [] } as unknown as TransactionReceipt);
    const drips = stubDrips({ id: 'drip-1', txHash: landed, createdAt: new Date(NOW - 3600_000) });
    await assert.rejects(approval(), code('APPROVAL_GAS_NEEDED'));
    assert.equal(drips.create.mock.callCount(), 0);
    assert.equal(h.relayed.length, 0);
  });

  it('waits on a drip still landing instead of sending another', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    const pending = `0x${'ef'.repeat(32)}` as Hex;
    stubDrips({ id: 'drip-1', txHash: pending, createdAt: new Date(NOW - 10_000) });
    assert.deepEqual(await approval(), { status: 'funding', dripTxHash: pending });
    assert.equal(h.relayed.length, 0);
  });

  it('frees the slot when the drip could not be signed (nothing went out)', async () => {
    harness({ allowance: 0n, ethBalance: 0n });
    mock.method(forwarderDeps, 'signRelayerTx', async () => {
      throw new Error('rpc down');
    });
    const drips = stubDrips();
    await assert.rejects(approval(), code('FORWARDER_UNAVAILABLE'));
    assert.equal(drips.delete.mock.callCount(), 1);
  });

  it('keeps the record when the drip may be out (broadcast result unknown)', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    mock.method(forwarderDeps, 'sendRaw', async () => {
      throw new Error('timeout');
    });
    const drips = stubDrips();
    const step = await approval();
    assert.deepEqual(step, { status: 'funding', dripTxHash: h.relayed[0].hash });
    assert.equal(drips.delete.mock.callCount(), 0);
  });

  it('clears a stale drip that was recorded but never signed, then drips', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    const drips = stubDrips({ id: 'drip-0', txHash: null, createdAt: new Date(NOW - 3 * 60_000) });
    const step = await approval();
    assert.equal(step.status, 'funding');
    assert.deepEqual((drips.deleteMany.mock.calls[0].arguments as any[])[0], { where: { id: 'drip-0', txHash: null } });
    assert.equal(h.relayed.length, 1);
  });

  it('refuses to drip more than the cap when fees spike', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n, maxFee: 1_000_000_000_000n });
    const drips = stubDrips();
    await assert.rejects(approval(), code('GAS_TOO_HIGH'));
    assert.equal(drips.create.mock.callCount(), 0);
    assert.equal(h.relayed.length, 0);
  });

  it('waits when another request is creating the drip right now', async () => {
    const h = harness({ allowance: 0n, ethBalance: 0n });
    const drips = stubDrips();
    drips.create.mock.mockImplementation(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });
    assert.deepEqual(await approval(), { status: 'funding', dripTxHash: null });
    assert.equal(h.relayed.length, 0);
  });
});

describe('Base USDT funding path (#191)', () => {
  it('goes through V2 and needs the approval; Celo USDT and USDC do not', () => {
    const before = process.env.PAYOUT_FORWARDER_ENABLED;
    process.env.PAYOUT_FORWARDER_ENABLED = 'true';
    try {
      assert.equal(cryptoFundingPathFor({ id: 'u1', privyDid: 'did:privy:u1' }, 'base', 'USDT'), 'forwarder');
    } finally {
      if (before === undefined) delete process.env.PAYOUT_FORWARDER_ENABLED;
      else process.env.PAYOUT_FORWARDER_ENABLED = before;
    }
    assert.equal(forwarderTokenNeedsApproval('base', 'USDT'), true);
    assert.equal(forwarderTokenNeedsApproval('celo', 'USDT'), false);
    assert.equal(forwarderTokenNeedsApproval('base', 'USDC'), false);
  });
});
