import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const pagesAssetPrefix = (process.env.PAGES_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: "export",
      ...(pagesAssetPrefix ? { assetPrefix: pagesAssetPrefix } : {}),
      trailingSlash: true,
    }
  : {};

export default nextConfig;
