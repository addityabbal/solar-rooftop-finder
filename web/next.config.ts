import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep /web as the app root (OpenNext expects it). Shared JSON in ../config is
  // imported, so it is bundled; showcase scans are bundled by scripts/bundle-data.mjs.
  outputFileTracingRoot: __dirname,
  experimental: { externalDir: true },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings and secrets from .dev.vars, like the deployed Worker.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
