// src/index.ts
import { db } from "@shulstack/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
var STAFF_ROLES = [
  "owner",
  "executive-director",
  "finance",
  "editor",
  "volunteer"
];
var auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_ORIGIN ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true
  }),
  emailAndPassword: {
    enabled: true
  },
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret-change-me-before-production",
  trustedOrigins: [process.env.APP_ORIGIN ?? "http://localhost:3000"]
});
export {
  STAFF_ROLES,
  auth
};
