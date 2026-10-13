import type { NextConfig } from "next";

// Allow building a static export for the APK by setting
// NEXT_OUTPUT=export at build time. Default is standalone (for server deployment).
const outputMode = (process.env.NEXT_OUTPUT as 'standalone' | 'export' | undefined) || 'standalone';

const nextConfig: NextConfig = {
  output: outputMode,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // For static export, disable image optimization (not supported)
  images: outputMode === 'export' ? { unoptimized: true } : undefined,
  // For static export, set trailing slash for cleaner mobile URLs
  trailingSlash: outputMode === 'export',
};

export default nextConfig;
