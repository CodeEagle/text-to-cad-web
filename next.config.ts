import type { NextConfig } from "next";

const EXPLORER_HOST = process.env.EXPLORER_BIND_HOST && process.env.EXPLORER_BIND_HOST !== "0.0.0.0"
  ? process.env.EXPLORER_BIND_HOST
  : "127.0.0.1";
const EXPLORER_PORT = process.env.EXPLORER_PORT || "4178";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingExcludes: {
    "*": ["./var/**/*", "./data/**/*"]
  },
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy /cad-explorer/* through Next.js to the lazily-spawned Vite
      // explorer on localhost. Lets deployments expose a single public
      // upstream (Next.js on :3000) without their platform sidecar
      // failing health checks against the explorer port before any job
      // has spawned it.
      {
        source: "/cad-explorer/:path*",
        destination: `http://${EXPLORER_HOST}:${EXPLORER_PORT}/:path*`
      }
    ];
  }
};

export default nextConfig;
