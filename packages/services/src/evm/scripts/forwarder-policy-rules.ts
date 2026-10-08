#!/usr/bin/env node
/**
 * Ops: let the Instant Send Privy policy sign for PayoutForwarderV2 (#191).
 *
 * For every rule that allows our server signer to sign a ReceiveWithAuthorization to V1, adds the
 * same rule with `to` = V2: same chain, same token domain, same $10k cap. Rules already there are
 * skipped, so it is safe to run twice. Prints the plan unless --apply.
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

type Condition = { field_source: string; field: string; operator: string; value: unknown } & Record<string, unknown>;
type Rule = { id?: string; name: string; method: string; action: string; conditions: Condition[] };

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const isTo = (c: Condition) => c.field_source === 'ethereum_typed_data_message' && c.field === 'to' && c.operator === 'eq';

function signsTo(rule: Rule, forwarder: Address): boolean {
  const to = rule.conditions.find(isTo)?.value;
  return rule.method === 'eth_signTypedData_v4' && typeof to === 'string' && isAddress(to) && getAddress(to) === forwarder;
}

/** The rule's conditions with `to` swapped, as a comparable key. */
const shape = (rule: Rule, to: string) => JSON.stringify(rule.conditions.map((c) => (isTo(c) ? { ...c, value: to } : c)));

async function main() {
  const apply = process.argv.includes('--apply');
  const v1 = getAddress(env('PAYOUT_FORWARDER_ADDRESS'));
  const v2 = getAddress(env('PAYOUT_FORWARDER_V2_ADDRESS'));
  const policyId = env('NEXT_PUBLIC_PRIVY_POLICY_ID');
  const client = new PrivyClient({ appId: env('NEXT_PUBLIC_PRIVY_APP_ID'), appSecret: env('PRIVY_APP_SECRET') });

  const policy = (await client.policies().get(policyId)) as unknown as { name: string; rules: Rule[] };
  const done = new Set(policy.rules.filter((r) => signsTo(r, v2)).map((r) => shape(r, v2)));
  const planned: Rule[] = policy.rules
    .filter((r) => r.action === 'ALLOW' && signsTo(r, v1) && !done.has(shape(r, v2)))
    .map((r) => ({
      name: r.name.includes('to forwarder') ? r.name.replace('to forwarder', 'to forwarder V2') : `${r.name} (V2)`,
      method: r.method,
      action: r.action,
      conditions: r.conditions.map((c) => (isTo(c) ? { ...c, value: v2 } : c)),
    }));

  console.log(`Policy "${policy.name}" (${policyId}): ${policy.rules.length} rules, ${done.size} already allow V2.`);
  if (!planned.length) {
    console.log('Nothing to add.');
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
