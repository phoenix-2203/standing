import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle for the container image (deploy/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
