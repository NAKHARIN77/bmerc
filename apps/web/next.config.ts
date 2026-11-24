import type { NextConfig } from "next";

// The browser only talks to this origin. /api/v1 is forwarded to the NestJS API, so the API's
// httpOnly cookies are first-party here. Set API_ORIGIN at build time for other environments.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@bmerc/shared"],
  // Dev only: lets a phone on the same Wi-Fi open the dev server by the PC's LAN address (e.g. 192.168.1.53).
  allowedDevOrigins: ["192.168.*.*"],
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
