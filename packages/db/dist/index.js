var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/client.ts
import { DEFAULT_DATABASE_URL } from "@shulstack/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  auditActionEnum: () => auditActionEnum,
  auditLogs: () => auditLogs,
  eventStatusEnum: () => eventStatusEnum,
  institutions: () => institutions,
  moduleEnablement: () => moduleEnablement,
  outboxEvents: () => outboxEvents
});

// src/schema/platform.ts
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
var auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "login",
  "logout",
  "publish"
]);
var eventStatusEnum = pgEnum("event_status", ["pending", "processed", "failed"]);
var institutions = pgTable("institutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Denver"),
  branding: jsonb("branding").$type().notNull().default({}),
  settings: jsonb("settings").$type().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var moduleEnablement = pgTable("module_enablement", {
  id: uuid("id").defaultRandom().primaryKey(),
  institutionId: uuid("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  moduleSlug: varchar("module_slug", { length: 64 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  institutionId: uuid("institution_id").references(() => institutions.id, {
    onDelete: "set null"
  }),
  actorId: text("actor_id"),
  entityType: varchar("entity_type", { length: 128 }).notNull(),
  entityId: text("entity_id").notNull(),
  action: auditActionEnum("action").notNull(),
  before: jsonb("before").$type(),
  after: jsonb("after").$type(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var outboxEvents = pgTable("outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  institutionId: uuid("institution_id").references(() => institutions.id, {
    onDelete: "set null"
  }),
  eventName: varchar("event_name", { length: 128 }).notNull(),
  payload: jsonb("payload").$type().notNull(),
  status: eventStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
});

// src/client.ts
var globalForDb = globalThis;
var pool = globalForDb.__shulstackPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
});
if (process.env.NODE_ENV !== "production") {
  globalForDb.__shulstackPool = pool;
}
var db = drizzle(pool, { schema: schema_exports });
export {
  db,
  pool,
  schema_exports as schema
};
