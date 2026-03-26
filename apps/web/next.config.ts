import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Expose API_URL to server-side code
    API_URL: process.env.API_URL,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
