import { DepositService } from '../deposit.service';

/**
 * DepositIndexer — ADDRESS_ACTIVITY / ERC-20 receives only.
 * Remittances are handled by RemittanceIndexer.
 */
export class DepositIndexer {
  static async handleAlchemyActivity(payload: {
    event?: {
      network?: string;
      activity?: Array<any>;
    };
  }) {
    const result = await DepositService.handleAlchemyActivity({
      network: payload.event?.network,
      activity: payload.event?.activity ?? [],
    });

    return {
      success: true as const,
      message: 'Deposit activity processed',
      synced: result.credited,
      skipped: result.skipped,
    };
  }
}
