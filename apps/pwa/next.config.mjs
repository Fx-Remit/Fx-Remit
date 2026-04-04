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
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'utf-8-validate', 'bufferutil'];
    }
    return config;
  },
};

export default nextConfig;
