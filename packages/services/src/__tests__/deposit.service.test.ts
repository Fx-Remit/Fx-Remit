import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DepositService } from '../deposit.service';

describe('DepositService allowlist', () => {
  it('allows Base USDC', () => {
    const token = DepositService.findToken(
      8453,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
    assert.equal(token?.symbol, 'USDC');
  });

  it('rejects unknown Base token', () => {
    const token = DepositService.findToken(
      8453,
      '0x0000000000000000000000000000000000000001',
    );
    assert.equal(token, undefined);
  });

  it('allows Celo cUSD', () => {
    const token = DepositService.findToken(
      42220,
      '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    );
    assert.equal(token?.symbol, 'cUSD');
  });

  it('allows Celo native USDC', () => {
    const token = DepositService.findToken(
      42220,
      '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    );
    assert.equal(token?.symbol, 'USDC');
    assert.equal(token?.decimals, 6);
  });
});
