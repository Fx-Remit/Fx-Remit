import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import RouterABI from '../abi/FXRemitRouter.json';

export interface RemitHook {
  remit: (
    routerAddress: `0x${string}`,
    fromToken: `0x${string}`,
    toToken: `0x${string}`,
    amountIn: bigint,
    minAmountOut: bigint,
    rate: bigint,
    messageHash: string,
    targetCurrency: string,
    providerId?: string
  ) => void;
  hash: `0x${string}` | undefined;
  error: Error | null;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
}

export function useRemit(): RemitHook {
  const { writeContract, data: hash, error, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const remit = async (
    routerAddress: `0x${string}`,
    fromToken: `0x${string}`,
    toToken: `0x${string}`,
    amountIn: bigint,
    minAmountOut: bigint,
    rate: bigint,
    messageHash: string,
    targetCurrency: string,
    providerId: string = 'paycrest'
  ) => {
    return writeContract({
      address: routerAddress,
      abi: RouterABI,
      functionName: 'swapAndRemit',
      args: [
        fromToken,
        toToken,
        amountIn,
        minAmountOut,
        rate,
        '0x0000000000000000000000000000000000000000', // refundAddress (Defaults to sender via contract)
        messageHash,
        targetCurrency,
        providerId
      ],
    });
  };

  return {
    remit,
    hash,
    error,
    isPending,
    isConfirming,
    isSuccess
  };
}
