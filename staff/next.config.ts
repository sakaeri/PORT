import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app shares a git repo with ../  (the client app), which has its own
  // lockfile — pin the workspace root explicitly so Turbopack doesn't guess.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
