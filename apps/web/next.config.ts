import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The @allday/db package is a workspace dep that ships TypeScript directly.
  // transpilePackages tells Next.js to compile it as part of the app build.
  transpilePackages: ['@allday/db'],

  // We never serve images from this app; product imagery lives on Cloudflare R2
  // behind their CDN. If a remote-image domain is ever needed, add it here.
  images: {
    remotePatterns: [],
  },

  // Strict mode catches common React mistakes during dev.
  reactStrictMode: true,
};

export default nextConfig;
