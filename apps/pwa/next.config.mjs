/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@fx-remit/ui-components',
    '@fx-remit/services',
    '@fx-remit/database',
    '@fx-remit/shared-sdk',
    'jose',
    '@privy-io/node',
  ],
  experimental: {
    allowedDevOrigins: [
      'championless-thermogenetic-ariane.ngrok-free.dev',
      'localhost:3000'
    ]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'utf-8-validate', 'bufferutil'];
    }
    return config;
  },
};

export default nextConfig;
