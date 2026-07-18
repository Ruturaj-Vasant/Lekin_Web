import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "Lekin_Web";
const pagesAssetPrefix = `/${repositoryName}`;

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: "export",
      assetPrefix: pagesAssetPrefix,
      trailingSlash: true,
    }
  : {};

export default nextConfig;
