/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@shulstack/platform", "@shulstack/ui"],
};

export default nextConfig;
