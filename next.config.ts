import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // pptxgenjs has Node-only branches (node:fs, node:https) that never run
      // in the browser; strip the scheme and stub them out of client bundles.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false, http: false, path: false, os: false, url: false };
    }
    return config;
  },
};

export default nextConfig;
