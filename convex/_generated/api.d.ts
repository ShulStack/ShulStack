/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as content from "../content.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as finance from "../finance.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_domainEvents from "../lib/domainEvents.js";
import type * as lib_validators from "../lib/validators.js";
import type * as platform from "../platform.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  content: typeof content;
  crm: typeof crm;
  crons: typeof crons;
  events: typeof events;
  finance: typeof finance;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/domainEvents": typeof lib_domainEvents;
  "lib/validators": typeof lib_validators;
  platform: typeof platform;
  seed: typeof seed;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
