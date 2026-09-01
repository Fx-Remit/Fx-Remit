import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow ngrok (or other tunnel) to load `/_next/*` assets in dev without cross-origin warnings.
  allowedDevOrigins: ['championless-thermogenetic-ariane.ngrok-free.dev'],
  transpilePackages: [
    '@fx-remit/ui-components',
    '@fx-remit/services',
    '@fx-remit/database',
    '@fx-remit/shared-sdk',
    'jose',
    '@privy-io/node',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'utf-8-validate', 'bufferutil'];
    }
    // pnpm + WalletConnect/pino: ensure slow-redact resolves for the client bundle
    config.resolve.alias = {
      ...config.resolve.alias,
      'slow-redact': require.resolve('slow-redact'),
    };
    return config;
  },
};

export default nextConfig;
