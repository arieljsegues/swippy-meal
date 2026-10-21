
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/tinder-meal",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
