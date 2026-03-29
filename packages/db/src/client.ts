import { DEFAULT_DATABASE_URL } from "@shulstack/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __shulstackPool?: Pool;
};

export const pool =
  globalForDb.__shulstackPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__shulstackPool = pool;
}

export const db = drizzle(pool, { schema });
