#!/usr/bin/env node
/**
 * Ops: let the Instant Send Privy policy sign for PayoutForwarderV2 (#191).
 *
 * Makes sure every token the forwarder pays (USDC on Base and Celo, USDT on Celo) has a rule
 * allowing our server signer to sign a ReceiveWithAuthorization to V2. Each new rule is a copy of
 * that chain's existing forwarder rule (same chain, same $10k cap) with the token's domain and
 * `to` = V2. Rules already there are skipped, so it is safe to run again. Prints the plan unless --apply.
 *
 * Usage (from packages/services):
 *   PAYOUT_FORWARDER_V2_ADDRESS=0x… pnpm exec node --import tsx --env-file=../../apps/pwa/.env.local \
 *     src/evm/scripts/forwarder-policy-rules.ts            # show the rules it would add
 *   ... forwarder-policy-rules.ts --apply                  # add them
 *
 * Needs NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET, NEXT_PUBLIC_PRIVY_POLICY_ID,
 * PRIVY_AUTHORIZATION_PRIVATE_KEY (the policy owner's key), PAYOUT_FORWARDER_ADDRESS (V1) and
 * PAYOUT_FORWARDER_V2_ADDRESS.
 */
import { getAddress, isAddress, type Address } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { forwarderTokenList } from '../forwarder-payout.js';

type Condition = { field_source: string; field: string; operator: string; value: unknown } & Record<string, unknown>;
type Rule = { id?: string; name: string; method: string; action: string; conditions: Condition[] };

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const isTo = (c: Condition) => c.field_source === 'ethereum_typed_data_message' && c.field === 'to' && c.operator === 'eq';
const isDomain = (field: string) => (c: Condition) =>
  c.field_source === 'ethereum_typed_data_domain' && c.field === field && c.operator === 'eq';
const valueOf = (rule: Rule, match: (c: Condition) => boolean) => rule.conditions.find(match)?.value;
const sameAddress = (value: unknown, address: Address) =>
  typeof value === 'string' && isAddress(value) && getAddress(value) === address;

async function main() {
  const apply = process.argv.includes('--apply');
  const v1 = getAddress(env('PAYOUT_FORWARDER_ADDRESS'));
  const v2 = getAddress(env('PAYOUT_FORWARDER_V2_ADDRESS'));
  const policyId = env('NEXT_PUBLIC_PRIVY_POLICY_ID');
  const client = new PrivyClient({ appId: env('NEXT_PUBLIC_PRIVY_APP_ID'), appSecret: env('PRIVY_APP_SECRET') });

  const policy = (await client.policies().get(policyId)) as unknown as { name: string; rules: Rule[] };
  const planned: Rule[] = [];
  for (const token of forwarderTokenList()) {
    // Forwarder signing rules on this chain (to V1 or V2).
    const onChain = policy.rules.filter(
      (r) =>
        r.method === 'eth_signTypedData_v4' &&
        r.action === 'ALLOW' &&
        String(valueOf(r, isDomain('chainId'))) === String(token.chainId) &&
        (sameAddress(valueOf(r, isTo), v1) || sameAddress(valueOf(r, isTo), v2)),
    );
    const forToken = (r: Rule) => sameAddress(valueOf(r, isDomain('verifyingContract')), token.address);
    if (onChain.some((r) => forToken(r) && sameAddress(valueOf(r, isTo), v2))) continue;
    const template = onChain.find(forToken) ?? onChain[0];
    if (!template) {
      console.log(`! no forwarder rule on chain ${token.chainId} to copy; add ${token.symbol} by hand`);
      continue;
    }
    planned.push({
      name: `${token.symbol} auth to forwarder V2, chain ${token.chainId}, max $10k`,
      method: template.method,
      action: template.action,
      conditions: template.conditions.map((c) =>
        isTo(c) ? { ...c, value: v2 } : isDomain('verifyingContract')(c) ? { ...c, value: token.address } : c,
      ),
    });
  }

  console.log(`Policy "${policy.name}" (${policyId}): ${policy.rules.length} rules.`);
  if (!planned.length) {
    console.log('Every forwarder token already has a V2 rule. Nothing to add.');
    return;
  }
  for (const rule of planned) console.log(`- ${rule.name}`);
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to add these rules.');
    return;
  }
  for (const rule of planned) {
    const created = await client.policies().createRule(policyId, {
      ...(rule as never),
      authorization_context: { authorization_private_keys: [env('PRIVY_AUTHORIZATION_PRIVATE_KEY')] },
    });
    console.log(`added ${(created as { id?: string }).id ?? ''} ${rule.name}`);
  }
}

// Importing the forwarder module opens a DB pool that would keep the process alive: exit explicitly.
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
