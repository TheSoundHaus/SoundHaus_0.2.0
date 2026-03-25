import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    // Expose API_URL to server-side code
    API_URL: process.env.API_URL,
  },
};

export default nextConfig;
