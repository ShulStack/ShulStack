import { db } from "@shulstack/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const STAFF_ROLES = [
  "owner",
  "executive-director",
  "finance",
  "editor",
  "volunteer",
] as const;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_ORIGIN ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret-change-me-before-production",
  trustedOrigins: [process.env.APP_ORIGIN ?? "http://localhost:3000"],
});
