import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack does not infer it from
  // an unrelated parent lockfile.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
