import { DepositIndexer } from '../deposits/deposit.indexer';
import { RemittanceIndexer } from '../transactions/remittance.indexer';

/**
 * Alchemy webhook router — delegates to DepositIndexer or RemittanceIndexer.
 */
export class AlchemyService {
  static async handleWebhook(payload: any) {
    const type = String(payload?.type || '').toUpperCase();

    if (type === 'ADDRESS_ACTIVITY' || payload?.event?.activity) {
      return DepositIndexer.handleAlchemyActivity(payload);
    }

    return RemittanceIndexer.handleAlchemyLogs(payload);
  }
}
