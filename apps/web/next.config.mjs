import { withEve } from "eve/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@shulstack/platform", "@shulstack/ui"],
};

// Bundled eve agents are opt-in: set AGENTS_ENABLED=true (plus the env vars
// described in docs/agents.md) and the agents deploy with the app, mounted
// under /eve/agents/<name>/. Without the flag this config is untouched.
export default process.env.AGENTS_ENABLED === "true"
  ? withEve(nextConfig, {
      agents: {
        sruly: "../../agents/sruly",
      },
    })
  : nextConfig;
