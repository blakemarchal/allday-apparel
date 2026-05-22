import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript directly; Next compiles them as part
  // of the app build.
  transpilePackages: ['@allday/db', '@allday/workers'],

  // We never serve images from this app; product imagery lives on Cloudflare R2
  // behind their CDN. If a remote-image domain is ever needed, add it here.
  images: {
    remotePatterns: [],
  },

  // Strict mode catches common React mistakes during dev.
  reactStrictMode: true,
};

export default nextConfig;
