process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= 'test-app';
process.env.PRIVY_APP_SECRET ??= 'test-secret';
process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ??= 'test-auth-key';
process.env.PAYOUT_FORWARDER_ADDRESS = '0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83';
process.env.RELAYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
process.env.BASE_RPC_URL ??= 'http://127.0.0.1:8545';
process.env.CELO_RPC_URL ??= 'http://127.0.0.1:8546';
process.env.PAYOUT_FORWARDER_CHAINS = '8453,42220';

import { describe, it, mock, afterEach } from 'node:test';
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
import { prisma } from '@fx-remit/database';
import { TransactionService } from '../transactions/transaction.service.js';
import { CryptoAddressService } from '../crypto-addresses/crypto-address.service.js';
import { InstantSendWalletError } from './instant-send.broadcast.js';
import {
  checkRelayerGas,
  broadcastForwarderPayout,
  broadcastForwarderCryptoTransfer,
  cryptoFundingPathFor,
  forwarderAuthorizationNonce,
  fundingReceiptMatches,
  forwarderDeps,
  PAYOUT_FORWARDER_ABI,
  PAYOUT_FORWARDER_V2_ABI,
  prepareCryptoAuthorization,
  recoverStuckForwarderClaims,
  type ForwarderPublicClient,
} from './forwarder-payout.js';

const FORWARDER = getAddress('0x05FAA8d97e5eB76778F4e1ae8327DE63692c8F83');
const CELO_USDC = getAddress('0xcebA9300f2b948710d2653dD7B07f33A8B32118C');
const BASE_USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const CELO_USDT = getAddress('0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e');
const PAYER = getAddress('0x1111111111111111111111111111111111111111');
const DEST = getAddress('0x3333333333333333333333333333333333333333');
const RELAYER = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
const ORDER = 1_790_000_000_000_777n;
const AMOUNT = 50_000_000n;
const KEY = 'crypto_1790000000000_abc1234';
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex;
const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

afterEach(() => {
  mock.restoreAll();
});

function cryptoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-c1',
    userId: 'u1',
    orderId: ORDER,
    txHash: `pending-${KEY}`,
    amountUsd: { toString: () => '50' },
    externalId: KEY,
    type: 'REMITTANCE',
    sourceToken: 'USDC',
    recipientBank: 'crypto:celo',
    recipientAcc: DEST.toLowerCase(),
    fundingPath: null,
    fundingTxHash: null,
    fundingTxRaw: null,
    ...overrides,
  } as never;
}

function log(address: Address, topics: Hex[], data: Hex) {
  return { address, topics, data } as never;
}

function receipt(usdc: Address, sink: Address = DEST, forwarder: Address = FORWARDER): TransactionReceipt {
  const amount = encodeAbiParameters([{ type: 'uint256' }], [AMOUNT]);
  return {
    status: 'success',
    logs: [
      log(usdc, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: PAYER, to: forwarder } }) as Hex[], amount),
      log(usdc, encodeEventTopics({ abi: TRANSFER_ABI, eventName: 'Transfer', args: { from: forwarder, to: sink } }) as Hex[], amount),
      log(
        forwarder,
        encodeEventTopics({ abi: PAYOUT_FORWARDER_ABI, eventName: 'PayoutFunded', args: { orderId: ORDER, payer: PAYER, sink } }) as Hex[],
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [usdc, AMOUNT]),
      ),
    ],
  } as unknown as TransactionReceipt;
}

async function signedPayoutTx(chainId: number, validBefore = BigInt(Math.floor(NOW / 1000) + 600)): Promise<Hex> {
  const data = encodeFunctionData({
    abi: PAYOUT_FORWARDER_ABI,
    functionName: 'payout',
    args: [ORDER, PAYER, DEST, AMOUNT, validBefore, 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
  });
  return RELAYER.signTransaction({
    chainId,
    type: 'eip1559',
    to: FORWARDER,
    data,
    nonce: 3,
    gas: 200_000n,
    maxFeePerGas: 10_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  });
}

type Harness = {
  chains: number[];
  dryRuns: Hex[];
  typedData: Record<string, any>[];
  relayerChains: number[];
  claim: ReturnType<typeof mock.fn>;
  release: ReturnType<typeof mock.fn>;
  markConfirmed: ReturnType<typeof mock.fn>;
};

function harness(
  opts: { row?: unknown; trusted?: boolean; dryRunFails?: boolean; balance?: bigint; domainVersion?: string } = {},
): Harness {
  const h: Harness = {
    chains: [],
    dryRuns: [],
    typedData: [],
    relayerChains: [],
    claim: mock.fn(async () => true),
    release: mock.fn(async () => true),
    markConfirmed: mock.fn(async () => {}),
  };
  const row = opts.row ?? cryptoRow();
  const usdcFor = (chainId: number) => (chainId === 42220 ? CELO_USDC : BASE_USDC);
  const raws = new Map<string, number>();

  mock.method(forwarderDeps, 'publicClient', (chainId: number = 8453) => {
    h.chains.push(chainId);
    const client: ForwarderPublicClient = {
      async readContract(args) {
        if (args.functionName === 'balanceOf') return opts.balance ?? AMOUNT;
        if (args.functionName === 'name') return 'USDC';
        if (args.functionName === 'DOMAIN_SEPARATOR') {
          // Celo USDT signs with domain version 1, USDC with 2; a test can make the token's domain differ.
          const version = opts.domainVersion ?? (getAddress(args.address) === CELO_USDT ? '1' : '2');
          return domainSeparator({ domain: { name: 'USDC', version, chainId, verifyingContract: args.address } });
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
    };
    return client;
  });
  mock.method(forwarderDeps, 'now', () => NOW);
  mock.method(forwarderDeps, 'sleep', async () => {});
  mock.method(forwarderDeps, 'isFunded', async () => false);
  mock.method(forwarderDeps, 'isVoided', async () => false);
  mock.method(forwarderDeps, 'withRelayerLock', async (fn: () => Promise<unknown>) => fn());
  mock.method(forwarderDeps, 'resolveWallet', async () => ({ walletId: 'wallet-1', delegated: true }));
  mock.method(forwarderDeps, 'signAuthorization', async (_w: string, td: Record<string, any>) => {
    h.typedData.push(td);
    return SIGNATURE;
  });
  mock.method(forwarderDeps, 'signRelayerTx', async (_to: Address, _data: Hex, chainId: number = 8453) => {
    h.relayerChains.push(chainId);
    const raw = await signedPayoutTx(chainId);
    raws.set(keccak256(raw), chainId);
    return raw;
  });
  mock.method(forwarderDeps, 'sendRaw', async () => {});
  mock.method(forwarderDeps, 'getReceipt', async (hash: Hex) => {
    const chainId = raws.get(hash);
    return chainId ? receipt(usdcFor(chainId)) : null;
  });

  mock.method(TransactionService, 'findRemittanceForBroadcast', async () => row);
  mock.method(TransactionService, 'claimBroadcastSlot', h.claim);
  mock.method(TransactionService, 'releaseBroadcastClaim', h.release);
  mock.method(TransactionService, 'saveFundingTx', async () => true);
  mock.method(TransactionService, 'attachOnChainHash', async () => ({}));
  mock.method(CryptoAddressService, 'listForUser', async () =>
    opts.trusted === false ? [] : [{ network: 'celo', address: DEST.toLowerCase(), fastPathEligible: true }],
  );
  mock.method(CryptoAddressService, 'markFirstConfirmed', h.markConfirmed);
  return h;
}

const send = (userAuthorization?: { signature: Hex; validBefore: string }) =>
  broadcastForwarderCryptoTransfer({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: PAYER, orderId: ORDER, userAuthorization });

const code = (expected: string) => (err: unknown) => err instanceof InstantSendWalletError && err.code === expected;

describe('broadcastForwarderCryptoTransfer: server-signed, trusted address', () => {
  it('funds a Celo USDC cash-out through the forwarder on Celo', async () => {
    const h = harness();
    const result = await send();

    assert.equal(result.alreadyBroadcast, false);
    const td = h.typedData[0];
    assert.equal(td.domain.chainId, 42220);
    assert.equal(td.domain.verifyingContract, CELO_USDC);
    assert.equal(td.message.to, FORWARDER);
    assert.equal(td.message.value, AMOUNT.toString());
    assert.equal(td.message.nonce, forwarderAuthorizationNonce(ORDER, DEST));
    assert.deepEqual(h.relayerChains, [42220]);
    assert.ok(h.chains.every((c) => c === 42220));
    const claimArgs = h.claim.mock.calls[0].arguments[0] as { pendingTxHash: string; fundingPath: string };
    assert.deepEqual([claimArgs.pendingTxHash, claimArgs.fundingPath], [`pending-${KEY}`, 'forwarder']);
    assert.deepEqual(h.markConfirmed.mock.calls[0].arguments, ['u1', 'celo', DEST.toLowerCase()]);
  });

  it('uses Base USDC and the Base relayer for a Base cash-out', async () => {
    const h = harness({ row: cryptoRow({ recipientBank: 'crypto:base' }) });
    mock.method(CryptoAddressService, 'listForUser', async () => [
      { network: 'base', address: DEST.toLowerCase(), fastPathEligible: true },
    ]);
    await send();
    assert.equal(h.typedData[0].domain.verifyingContract, BASE_USDC);
    assert.deepEqual(h.relayerChains, [8453]);
  });

  it('refuses a silent send to an address that is not trusted yet, before claiming', async () => {
    const h = harness({ trusted: false });
    await assert.rejects(send(), code('ADDRESS_NOT_TRUSTED'));
    assert.equal(h.claim.mock.callCount(), 0);
  });

  it('releases the claim and reports nothing moved when signing is refused', async () => {
    const h = harness();
    mock.method(forwarderDeps, 'signAuthorization', async () => {
      throw new Error('policy denied');
    });
    await assert.rejects(send(), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(h.release.mock.callCount(), 1);
  });
});

describe('broadcastForwarderCryptoTransfer: user-signed, any address', () => {
  const validBefore = String(Math.floor(NOW / 1000) + 600);

  it('relays the user signature without the server signing anything', async () => {
    const h = harness({ trusted: false });
    await send({ signature: SIGNATURE, validBefore });
    assert.equal(h.typedData.length, 0);
    const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_ABI, data: h.dryRuns[0] });
    assert.equal((call.args as readonly unknown[])[2], DEST);
    assert.equal((call.args as readonly unknown[])[4], BigInt(validBefore));
  });

  it('rejects an expired or too-distant authorization before claiming', async () => {
    for (const vb of [String(Math.floor(NOW / 1000)), String(Math.floor(NOW / 1000) + 3600), 'abc']) {
      const h = harness({ trusted: false });
      await assert.rejects(send({ signature: SIGNATURE, validBefore: vb }), code('AUTHORIZATION_EXPIRED'));
      assert.equal(h.claim.mock.callCount(), 0);
      mock.restoreAll();
    }
  });

  it('releases the claim when the signature does not match the order', async () => {
    const h = harness({ trusted: false, dryRunFails: true });
    await assert.rejects(send({ signature: SIGNATURE, validBefore }), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(h.release.mock.callCount(), 1);
  });
});

describe('broadcastForwarderCryptoTransfer: terms come only from the reserved row', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['a token the forwarder does not pay', { sourceToken: 'DAI' }, 'UNSUPPORTED_TOKEN'],
    ['Base USDT while only V1 (USDC-only) is configured', { sourceToken: 'USDT', recipientBank: 'crypto:base' }, 'FORWARDER_UNAVAILABLE'],
    ['USDT while only V1 (USDC-only) is configured', { sourceToken: 'USDT' }, 'FORWARDER_UNAVAILABLE'],
    ['arbitrum', { recipientBank: 'crypto:arbitrum' }, 'NOT_CRYPTO_CASH_OUT'],
    ['own wallet', { recipientAcc: PAYER }, 'SINK_IS_PAYER'],
    ['over the crypto cap', { amountUsd: { toString: () => '1000.000001' } }, 'AMOUNT_CAP'],
    ['a direct-path order', { fundingPath: 'direct' }, 'FUNDING_PATH_MISMATCH'],
  ];
  for (const [label, overrides, expected] of cases) {
    it(`refuses ${label} before claiming`, async () => {
      const h = harness({ row: cryptoRow(overrides) });
      await assert.rejects(send(), code(expected));
      assert.equal(h.claim.mock.callCount(), 0);
    });
  }

  it('lets the user sign above the silent cap, up to the contract limit', async () => {
    const big = { amountUsd: { toString: () => '5000' } };
    const ok = harness({ row: cryptoRow(big), trusted: false, balance: 5_000_000_000n });
    // Past the cap: claimed and relayed (the fake receipt is sized for $50, so settlement stops there).
    await send({ signature: SIGNATURE, validBefore: String(Math.floor(NOW / 1000) + 600) }).catch((err) => {
      assert.notEqual((err as InstantSendWalletError).code, 'AMOUNT_CAP');
    });
    assert.equal(ok.claim.mock.callCount(), 1);
    assert.deepEqual(ok.relayerChains, [42220]);
    mock.restoreAll();

    const h = harness({ row: cryptoRow({ amountUsd: { toString: () => '10000.000001' } }), trusted: false });
    await assert.rejects(send({ signature: SIGNATURE, validBefore: String(Math.floor(NOW / 1000) + 600) }), code('AMOUNT_CAP'));
    assert.equal(h.claim.mock.callCount(), 0);
  });

  it('refuses when the wallet holds less USDC than reserved', async () => {
    const h = harness({ balance: AMOUNT - 1n });
    await assert.rejects(send(), code('INSUFFICIENT_USDC'));
    assert.equal(h.claim.mock.callCount(), 0);
  });
});

describe('broadcastForwarderCryptoTransfer: resume', () => {
  it('resumes a saved Celo relayer tx on Celo and attaches it', async () => {
    const raw = await signedPayoutTx(42220);
    const h = harness({
      row: cryptoRow({ txHash: `broadcasting-${KEY}`, fundingPath: 'forwarder', fundingTxHash: keccak256(raw), fundingTxRaw: raw }),
    });
    const receiptChains: number[] = [];
    mock.method(forwarderDeps, 'getReceipt', async (_hash: Hex, chainId: number = 8453) => {
      receiptChains.push(chainId);
      return receipt(CELO_USDC);
    });
    const result = await send();
    assert.equal(result.txHash, keccak256(raw));
    assert.ok(receiptChains.length > 0 && receiptChains.every((c) => c === 42220));
    assert.equal(h.claim.mock.callCount(), 0);
    assert.equal(h.markConfirmed.mock.callCount(), 1);
  });
});

describe('prepareCryptoAuthorization', () => {
  it('returns the typed data the wallet signs, bound to the order, destination and amount', async () => {
    harness({ trusted: false });
    const prepared = await prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.equal(prepared.validBefore, String(Math.floor((NOW + 10 * 60_000) / 1000)));
    assert.equal(prepared.typedData.primaryType, 'ReceiveWithAuthorization');
    assert.equal(prepared.typedData.domain.chainId, 42220);
    assert.equal(prepared.typedData.message.from, PAYER);
    assert.equal(prepared.typedData.message.to, FORWARDER);
    assert.equal(prepared.typedData.message.validBefore, prepared.validBefore);
    assert.equal(prepared.typedData.message.nonce, forwarderAuthorizationNonce(ORDER, DEST));
  });

  it('refuses rows that are no longer pending', async () => {
    harness({ row: cryptoRow({ txHash: `broadcasting-${KEY}` }) });
    await assert.rejects(prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER }), code('NOT_PENDING'));
  });
});

describe('crypto cash-outs through PayoutForwarderV2 (#191)', () => {
  const V2 = getAddress('0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5');
  const validBefore = String(Math.floor(NOW / 1000) + 600);
  afterEach(() => {
    delete process.env.PAYOUT_FORWARDER_V2_ADDRESS;
  });

  it('has the user sign for V2, pins V2 at claim and relays payoutWithAuthorization', async () => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
    harness({ trusted: false });
    const prepared = await prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.equal(prepared.typedData.message.to, V2);

    mock.restoreAll();
    const h = harness({ trusted: false, dryRunFails: true });
    await assert.rejects(send({ signature: SIGNATURE, validBefore }), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal((h.claim.mock.calls[0].arguments[0] as { fundingContract?: string }).fundingContract, V2);
    const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_V2_ABI, data: h.dryRuns[0] });
    assert.equal(call.functionName, 'payoutWithAuthorization');
    assert.deepEqual(call.args.slice(0, 5), [ORDER, PAYER, DEST, CELO_USDC, AMOUNT]);
  });

  it('pays Celo USDT through V2: Tether domain (version 1), USDT in the call and in the receipt legs', async () => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
    const usdtRow = cryptoRow({ sourceToken: 'USDT' });
    harness({ trusted: false, row: usdtRow });
    const prepared = await prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.deepEqual(prepared.typedData.domain, { name: 'USDC', version: '1', chainId: 42220, verifyingContract: CELO_USDT });
    assert.equal(prepared.typedData.message.to, V2);
    assert.equal(prepared.typedData.message.value, AMOUNT.toString());

    mock.restoreAll();
    const h = harness({ trusted: true, row: usdtRow, dryRunFails: true });
    await assert.rejects(send(), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(h.typedData[0].domain.verifyingContract, CELO_USDT);
    assert.equal(h.typedData[0].domain.version, '1');
    const call = decodeFunctionData({ abi: PAYOUT_FORWARDER_V2_ABI, data: h.dryRuns[0] });
    assert.deepEqual(call.args.slice(0, 5), [ORDER, PAYER, DEST, CELO_USDT, AMOUNT]);

    const ctx = { orderId: ORDER, payer: PAYER, sink: DEST, token: CELO_USDT, forwarder: V2, amount: AMOUNT } as never;
    assert.equal(fundingReceiptMatches(receipt(CELO_USDT, DEST, V2), ctx), true);
    assert.equal(fundingReceiptMatches(receipt(CELO_USDC, DEST, V2), ctx), false);
  });

  it('keeps the claim when a saved tx pays a different token than the crypto row reserved', async () => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
    const data = encodeFunctionData({
      abi: PAYOUT_FORWARDER_V2_ABI,
      functionName: 'payoutWithAuthorization',
      args: [ORDER, PAYER, DEST, CELO_USDC, AMOUNT, BigInt(Math.floor(NOW / 1000) + 600), 27, `0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
    });
    const raw = await RELAYER.signTransaction({
      chainId: 42220, type: 'eip1559', to: V2, data, nonce: 3, gas: 200_000n, maxFeePerGas: 10_000_000n, maxPriorityFeePerGas: 1_000_000n,
    });
    const h = harness({
      row: cryptoRow({
        sourceToken: 'USDT',
        txHash: `broadcasting-${KEY}`,
        fundingPath: 'forwarder',
        fundingContract: V2,
        fundingTxHash: keccak256(raw),
        fundingTxRaw: raw,
      }),
    });
    await assert.rejects(send(), code('BROADCAST_UNCERTAIN'));
    assert.equal(h.release.mock.callCount(), 0);
  });

  it('refuses to sign when the token no longer matches its EIP-712 domain, and sends nothing', async () => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
    const h = harness({ trusted: true, row: cryptoRow({ sourceToken: 'USDT' }), domainVersion: '2' });
    await assert.rejects(send(), code('PAYOUT_NOT_AUTHORIZED'));
    assert.equal(h.typedData.length, 0);
    assert.equal(h.relayerChains.length, 0);
    assert.equal(h.release.mock.callCount(), 1);
  });

  it('keeps a crypto cash-out pinned to V1 on V1', async () => {
    process.env.PAYOUT_FORWARDER_V2_ADDRESS = V2;
    harness({ trusted: false, row: cryptoRow({ fundingPath: 'forwarder', fundingContract: FORWARDER }) });
    const prepared = await prepareCryptoAuthorization({ userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.equal(prepared.typedData.message.to, FORWARDER);
  });
});

describe('cryptoFundingPathFor', () => {
  const user = { id: 'u1', privyDid: 'did:privy:u1' };
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it('uses the forwarder when it is on and the chain is configured', () => {
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'true' }, () => {
      assert.equal(cryptoFundingPathFor(user, 'base'), 'forwarder');
      assert.equal(cryptoFundingPathFor(user, 'celo'), 'forwarder');
      assert.equal(cryptoFundingPathFor(user, 'arbitrum'), 'unavailable');
    });
  });

  it('is unavailable until the chain is switched on in PAYOUT_FORWARDER_CHAINS', () => {
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'true', PAYOUT_FORWARDER_CHAINS: '8453' }, () => {
      assert.equal(cryptoFundingPathFor(user, 'base'), 'forwarder');
      assert.equal(cryptoFundingPathFor(user, 'celo'), 'unavailable');
    });
  });

  it('is unavailable, not direct, when the forwarder is on but the chain has no RPC', () => {
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'true', CELO_RPC_URL: undefined }, () => {
      assert.equal(cryptoFundingPathFor(user, 'celo'), 'unavailable');
    });
  });

  it('keeps the legacy direct send while the forwarder is off for the user', () => {
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'false', PAYOUT_FORWARDER_ALLOWLIST: '' }, () => {
      assert.equal(cryptoFundingPathFor(user, 'celo'), 'direct');
    });
  });

  it('sends USDT only through V2, never on the direct path (#191)', () => {
    const V2 = '0x6575f142Ab3a557DF60F5a9B4d5cf0BD5f3732D5';
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'true', PAYOUT_FORWARDER_V2_ADDRESS: V2 }, () => {
      assert.equal(cryptoFundingPathFor(user, 'celo', 'USDT'), 'forwarder');
      assert.equal(cryptoFundingPathFor(user, 'base', 'USDT'), 'forwarder');
      assert.equal(cryptoFundingPathFor(user, 'arbitrum', 'USDT'), 'unavailable');
    });
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'true', PAYOUT_FORWARDER_V2_ADDRESS: undefined }, () => {
      assert.equal(cryptoFundingPathFor(user, 'celo', 'USDT'), 'unavailable');
      assert.equal(cryptoFundingPathFor(user, 'celo', 'USDC'), 'forwarder');
    });
    withEnv({ PAYOUT_FORWARDER_ENABLED: 'false', PAYOUT_FORWARDER_ALLOWLIST: '', PAYOUT_FORWARDER_V2_ADDRESS: V2 }, () => {
      assert.equal(cryptoFundingPathFor(user, 'celo', 'USDT'), 'unavailable');
    });
  });
});

describe('recoverStuckForwarderClaims for crypto rows', () => {
  it('keeps claims held on a chain that is not switched on', async () => {
    harness();
    const raw = await signedPayoutTx(42220);
    const getReceipt = mock.method(forwarderDeps, 'getReceipt', async () => receipt(CELO_USDC));
    prisma.transaction.findMany = mock.fn(async () => [
      { userId: 'u1', orderId: ORDER, txHash: `broadcasting-${KEY}`, fundingTxHash: keccak256(raw), fundingTxRaw: raw, recipientBank: 'crypto:celo', recipientAcc: DEST.toLowerCase() },
    ]) as never;
    const saved = process.env.PAYOUT_FORWARDER_CHAINS;
    process.env.PAYOUT_FORWARDER_CHAINS = '8453';
    try {
      const { results } = (await recoverStuckForwarderClaims()) as { results: { outcome: string }[] };
      assert.deepEqual(results.map((r) => r.outcome), ['waiting']);
      assert.equal(getReceipt.mock.callCount(), 0);
    } finally {
      process.env.PAYOUT_FORWARDER_CHAINS = saved;
    }
  });

  it('reads the chain from the saved relayer tx and attaches a landed Celo payout', async () => {
    const h = harness();
    const raw = await signedPayoutTx(42220);
    const receiptChains: number[] = [];
    mock.method(forwarderDeps, 'getReceipt', async (_hash: Hex, chainId: number = 8453) => {
      receiptChains.push(chainId);
      return receipt(CELO_USDC);
    });
    const attach = mock.method(TransactionService, 'attachOnChainHash', async () => ({}));
    prisma.transaction.findMany = mock.fn(async () => [
      {
        userId: 'u1',
        orderId: ORDER,
        txHash: `broadcasting-${KEY}`,
        fundingTxHash: keccak256(raw),
        fundingTxRaw: raw,
        recipientBank: 'crypto:celo',
        recipientAcc: DEST.toLowerCase(),
      },
    ]) as never;

    const { results } = (await recoverStuckForwarderClaims()) as { results: { outcome: string }[] };
    assert.deepEqual(results.map((r) => r.outcome), ['attached']);
    assert.deepEqual(receiptChains, [42220]);
    assert.equal(attach.mock.callCount(), 1);
    assert.deepEqual(h.markConfirmed.mock.calls[0].arguments, ['u1', 'celo', DEST.toLowerCase()]);
  });
});

describe('broadcastForwarderPayout from Celo (#196)', () => {
  it('funds a Celo-sourced bank payout through the forwarder on Celo', async () => {
    const h = harness();
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () =>
      cryptoRow({ txHash: 'pending-pc-celo-1', recipientBank: 'OPay', recipientAcc: '0000000000', sourceNetwork: 'celo' }),
    );
    mock.method(forwarderDeps, 'getSettlement', async (_id: string, network?: string | null) => ({
      success: true,
      order: { providerAccount: { receiveAddress: DEST, amountToTransfer: '50', validUntil: new Date(NOW + 30 * 60_000).toISOString() } },
      settlement: { network, tokenAddress: network === 'celo' ? CELO_USDC : BASE_USDC, decimals: 6 },
    }) as never);
    await broadcastForwarderPayout({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: PAYER, orderId: ORDER });
    assert.equal(h.typedData[0].domain.chainId, 42220);
    assert.equal(h.typedData[0].domain.verifyingContract, CELO_USDC);
    assert.deepEqual(h.relayerChains, [42220]);
    assert.equal(h.markConfirmed.mock.callCount(), 0);
  });

  it('refuses a Celo-sourced bank payout while Celo is not switched on', async () => {
    harness();
    mock.method(TransactionService, 'findPendingRemittanceForBroadcast', async () =>
      cryptoRow({ txHash: 'pending-pc-celo-1', recipientBank: 'OPay', sourceNetwork: 'celo' }),
    );
    const saved = process.env.PAYOUT_FORWARDER_CHAINS;
    process.env.PAYOUT_FORWARDER_CHAINS = '8453';
    try {
      await assert.rejects(
        broadcastForwarderPayout({ privyDid: 'did:privy:u1', userId: 'u1', walletAddress: PAYER, orderId: ORDER }),
        code('FORWARDER_UNAVAILABLE'),
      );
    } finally {
      process.env.PAYOUT_FORWARDER_CHAINS = saved;
    }
  });
});

describe('recoverStuckForwarderClaims for Celo-funded bank payouts (#196)', () => {
  it('checks a claim with nothing saved against the Celo forwarder, not Base', async () => {
    harness();
    const fundedChains: number[] = [];
    mock.method(forwarderDeps, 'isFunded', async (_f: string, _o: bigint, chainId: number = 8453) => {
      fundedChains.push(chainId);
      return false;
    });
    const release = mock.method(TransactionService, 'releaseBroadcastClaim', async () => true);
    prisma.transaction.findMany = mock.fn(async () => [
      { userId: 'u1', orderId: ORDER, txHash: 'broadcasting-pc-celo-1', fundingTxHash: null, fundingTxRaw: null, recipientBank: 'OPay', recipientAcc: '0000000000', sourceNetwork: 'celo' },
    ]) as never;
    const { results } = (await recoverStuckForwarderClaims()) as { results: { outcome: string }[] };
    assert.deepEqual(results.map((r) => r.outcome), ['released']);
    assert.deepEqual(fundedChains, [42220]);
    assert.equal(release.mock.callCount(), 1);
  });
});

describe('broadcastForwarderCryptoTransfer payout permission (#192)', () => {
  it('refuses a silent send before claiming when the payout policy is missing', async () => {
    const h = harness();
    mock.method(forwarderDeps, 'policyStatus', async () => 'missing');
    await assert.rejects(send(), code('PERMISSION_UPDATE_REQUIRED'));
    assert.equal(h.claim.mock.callCount(), 0);
  });

  it('never checks the policy when the user signs', async () => {
    harness({ trusted: false });
    const status = mock.method(forwarderDeps, 'policyStatus', async () => 'missing');
    await send({ signature: SIGNATURE, validBefore: String(Math.floor(NOW / 1000) + 600) });
    assert.equal(status.mock.callCount(), 0);
  });
});

describe('checkRelayerGas (#194)', () => {
  it('reports payouts left per switched-on chain and alerts when low', async () => {
    const balances: Record<number, bigint> = { 8453: 10n ** 15n, 42220: 10n ** 13n };
    mock.method(forwarderDeps, 'publicClient', (chainId: number = 8453) => ({
      getBalance: async () => balances[chainId],
      getGasPrice: async () => 10_000_000n, // 0.01 gwei: 1.5e12 wei per payout
    }) as never);
    const errors = mock.method(console, 'error', () => {});
    const results = await checkRelayerGas();
    const byChain = Object.fromEntries(results.map((r) => [r.chainId, r]));
    // Base counts double for its L1 data fee: 1e15 / (1.5e12 × 2) = 333.
    assert.deepEqual(byChain[8453], { chainId: 8453, balanceWei: String(10n ** 15n), payoutsLeft: 333, low: false });
    assert.deepEqual(byChain[42220], { chainId: 42220, balanceWei: String(10n ** 13n), payoutsLeft: 6, low: true });
    const logged = errors.mock.calls.map((c) => String(c.arguments[0])).filter((l) => l.includes('RELAYER_GAS_LOW'));
    assert.equal(logged.length, 1);
    assert.equal(JSON.parse(logged[0]).chainId, 42220);
  });
});

describe('checkRelayerGas guards (#194)', () => {
  it('sizes the cost from maxFeePerGas when it is above the gas price', async () => {
    mock.method(forwarderDeps, 'publicClient', () => ({
      getBalance: async () => 3n * 10n ** 13n,
      getGasPrice: async () => 10_000_000n,
      estimateFeesPerGas: async () => ({ maxFeePerGas: 20_000_000n }),
    }) as never);
    mock.method(console, 'error', () => {});
    const celo = (await checkRelayerGas()).find((r) => r.chainId === 42220) as { payoutsLeft: number };
    assert.equal(celo.payoutsLeft, 10); // 3e13 / (2e7 × 150k)
  });

  it('keeps alerting when RELAYER_MIN_PAYOUTS is blank or not a number', async () => {
    mock.method(forwarderDeps, 'publicClient', () => ({ getBalance: async () => 10n ** 13n, getGasPrice: async () => 10_000_000n }) as never);
    mock.method(console, 'error', () => {});
    for (const value of ['', 'abc', '0']) {
      process.env.RELAYER_MIN_PAYOUTS = value;
      const results = await checkRelayerGas();
      assert.ok(results.every((r) => 'low' in r && r.low), value);
    }
    delete process.env.RELAYER_MIN_PAYOUTS;
  });

  it('alerts when the check itself fails, instead of looking healthy', async () => {
    mock.method(forwarderDeps, 'publicClient', () => ({
      getBalance: async () => {
        throw new Error('rpc down');
      },
      getGasPrice: async () => 1n,
    }) as never);
    const errors = mock.method(console, 'error', () => {});
    const results = await checkRelayerGas();
    assert.ok(results.every((r) => 'error' in r));
    const failed = errors.mock.calls.map((c) => String(c.arguments[0])).filter((l) => l.includes('RELAYER_GAS_CHECK_FAILED'));
    assert.equal(failed.length, results.length);
  });
});
