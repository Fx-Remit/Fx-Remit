import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

function run(script: string) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(dir, script)],
    { stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('evm-paycrest-smoke.ts');
run('evm-webhook-smoke.ts');
console.log('\nEVM sandbox smoke suite complete');
