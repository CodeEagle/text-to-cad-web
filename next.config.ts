import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingExcludes: {
    "*": ["./var/**/*", "./data/**/*"]
  },
  reactStrictMode: true
};

export default nextConfig;
