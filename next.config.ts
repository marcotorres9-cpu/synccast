import type { NextConfig } from "next";

const outputMode = (process.env.NEXT_OUTPUT as 'standalone' | 'export' | undefined) || 'standalone';

const nextConfig: NextConfig = {
  output: outputMode,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: outputMode === 'export' ? { unoptimized: true } : undefined,
  trailingSlash: outputMode === 'export',
  async headers() {
    return [
      {
        // Apply CORS to all API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },
};

export default nextConfig;
