import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kivo/shared"],
  async headers() {
    return [
      {
        // The installed widget loads only /embed in a third-party iframe.
        source: "/((?!embed/?$).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
