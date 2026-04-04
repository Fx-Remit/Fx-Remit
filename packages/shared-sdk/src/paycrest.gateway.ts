import { JSEncrypt } from 'jsencrypt';
import { type PublicClient, type WalletClient, encodeFunctionData } from 'viem';
import { GATEWAY_ABI } from './abi/GatewayABI';
import { getNetworkConfig } from './config/network.config';

export interface RecipientInfo {
  beneficiary_name: string;
  account_number: string;
  bank_code: string;
  bank_name?: string;
  mobile_money_operator?: string;
  currency: string;
  reason?: string;
}

export class PaycrestGateway {
  private publicKey: string;

  /**
   * Initializes the Gateway with the Paycrest Aggregator Public Key.
   * You can fetch this from the Paycrest API /v1/aggregator/public-key
   */
  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  /**
   * Encrypts the recipient information JSON string using the RSA Aggregator Public Key.
   */
  public encryptRecipient(recipient: RecipientInfo): string {
    const encryptor = new JSEncrypt();
    encryptor.setPublicKey(this.publicKey);
    const json = JSON.stringify(recipient);
    const encrypted = encryptor.encrypt(json);
    
    if (!encrypted) {
      throw new Error('RSA encryption failed. Check if public key is valid.');
    }
    
    return encrypted;
  }

  /**
   * Prepares the transaction data for createOrder on-chain.
   */
  public prepareCreateOrderData(params: {
    chainId: number;
    token: `0x${string}`;
    amount: bigint;
    rate: bigint;
    refundAddress: `0x${string}`;
    recipient: RecipientInfo;
    partner?: `0x${string}`;
    partnerPercent?: bigint;
  }) {
    const { gatewayAddress } = getNetworkConfig(params.chainId);
    const messageHash = this.encryptRecipient(params.recipient);

    const data = encodeFunctionData({
      abi: GATEWAY_ABI,
      functionName: 'createOrder',
      args: [
        params.token,
        params.amount,
        params.rate,
        params.partner ?? '0x0000000000000000000000000000000000000000',
        params.partnerPercent ?? 0n,
        params.refundAddress,
        messageHash,
      ],
    });

    return {
      to: gatewayAddress,
      data,
      value: 0n, // Assuming non-payable logic for stablecoins
    };
  }
}
