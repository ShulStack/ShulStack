/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: [
    "@payloadcms/db-postgres",
    "drizzle-kit",
    "drizzle-orm",
    "graphile-worker",
    "pg",
    "sharp",
  ],
  transpilePackages: [
    "@shulstack/auth",
    "@shulstack/cms",
    "@shulstack/db",
    "@shulstack/platform",
    "@shulstack/ui",
  ],
};

export default nextConfig;
