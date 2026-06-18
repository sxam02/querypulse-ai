import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.0.10.21'],
  experimental: {
    middlewareClientMaxBodySize: '100mb',
  },
};

export default nextConfig;
