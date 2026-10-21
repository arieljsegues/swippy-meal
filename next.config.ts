
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/swippy-meal",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
