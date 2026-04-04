import { createPublicClient, http, getContract, Address, parseAbiItem } from 'viem';
import { base, celo, polygon } from 'viem/chains';
import FXRemitRouterABI from '../../services/src/abi/FXRemitRouter.json';

export class ContractService {
  private client;
  private contract;

  constructor(chainId: number, contractAddress: Address) {
    const chain = chainId === 8453 ? base : chainId === 42220 ? celo : polygon;
    
    this.client = createPublicClient({
      chain,
      transport: http(),
    });

    this.contract = getContract({
      address: contractAddress,
      abi: FXRemitRouterABI,
      client: this.client,
    });
  }

  /**
   * High-fidelity fetch of the current Fee Config.
   */
  async getFeeConfig() {
    const [collector, bps] = await Promise.all([
      this.contract.read.feeCollector(),
      this.contract.read.feeBps(),
    ]);
    return { collector, bps: Number(bps) };
  }

  /**
   * Watch for RemittanceInitiated events for real-time Sync.
   */
  watchRemittance(callback: (log: any) => void) {
    return this.client.watchEvent({
      address: this.contract.address,
      event: parseAbiItem('event RemittanceInitiated(uint256 indexed orderId, address indexed sender, address fromToken, address toToken, uint256 amountIn, uint256 amountToRemit, uint256 rate, uint256 chainId, string targetCurrency, string providerId, address indexed feeCollector, uint256 feeBps)'),
      onLogs: (logs) => logs.forEach(callback),
    });
  }
}
