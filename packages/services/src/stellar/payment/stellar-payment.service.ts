import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { Sep24Transaction, StellarNetwork } from '../types/types.js';
import {
  HORIZON_URL,
  STELLAR_NETWORK_PASSPHRASE,
} from '../config/anchors.config.js';

export interface SubmitSep24UsdcPaymentInput {
  network: StellarNetwork;
  keypair: Keypair;
  /** From SEP-24 transaction when ready */
  sep24: Pick<
    Sep24Transaction,
    'withdraw_anchor_account' | 'withdraw_memo' | 'withdraw_memo_type' | 'amount_in'
  >;
  assetCode: string;
  assetIssuer: string;
  /** Fallback when amount_in is missing */
  amount?: string;
}

export interface SubmitSep24UsdcPaymentResult {
  hash: string;
  amount: string;
  destination: string;
  memo: string;
  memoType: string;
}

/**
 * Build, sign, and submit a classic Stellar Payment of USDC to the anchor
 * using SEP-24 withdraw memo instructions.
 */
export async function submitSep24UsdcPayment(
  input: SubmitSep24UsdcPaymentInput,
): Promise<SubmitSep24UsdcPaymentResult> {
  const destination = input.sep24.withdraw_anchor_account?.trim();
  const memoValue = input.sep24.withdraw_memo?.trim();
  if (!destination || !memoValue) {
    throw new Error(
      'SEP-24 transaction missing withdraw_anchor_account or withdraw_memo',
    );
  }

  const amount = (input.sep24.amount_in ?? input.amount)?.trim();
  if (!amount) {
    throw new Error('Missing payment amount (amount_in or amount)');
  }

  const memoType = (input.sep24.withdraw_memo_type ?? 'text').toLowerCase();
  const memo = buildMemo(memoValue, memoType);
  const horizonUrl = HORIZON_URL[input.network];
  const passphrase = STELLAR_NETWORK_PASSPHRASE[input.network];
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(input.keypair.publicKey());
  const fee = await server.fetchBaseFee();
  const asset = new Asset(input.assetCode, input.assetIssuer);

  const tx = new TransactionBuilder(account, {
    fee: fee.toString(),
    networkPassphrase: passphrase,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset,
        amount,
      }),
    )
    .addMemo(memo)
    .setTimeout(180)
    .build();

  tx.sign(input.keypair);
  const result = await server.submitTransaction(tx);
  const hash = String(result.hash ?? '');
  if (!hash) {
    throw new Error('Horizon submit returned no transaction hash');
  }

  return {
    hash,
    amount,
    destination,
    memo: memoValue,
    memoType,
  };
}

export function buildMemo(value: string, memoType: string): Memo {
  switch (memoType) {
    case 'id':
      return Memo.id(value);
    case 'hash':
      return Memo.hash(value);
    case 'return':
      return Memo.return(value);
    case 'text':
    default:
      return Memo.text(value);
  }
}
