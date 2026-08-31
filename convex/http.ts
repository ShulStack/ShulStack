import { httpRouter } from "convex/server";

import { auth } from "./auth";
import {
  householdByIdHandler,
  householdsHandler,
  meHandler,
  peopleHandler,
  personByIdHandler,
  summaryHandler,
  transactionsHandler,
} from "./httpApi";
import {
  createHouseholdHandler,
  createPersonHandler,
  householdSubresourceHandler,
  updateHouseholdHandler,
  updatePersonHandler,
} from "./httpApiWrites";

const http = httpRouter();

auth.addHttpRoutes(http);

// The public API, keyed by institution-scoped API keys. Reads need the "read"
// scope (every key has it); writes need "write". See httpApi.ts,
// httpApiWrites.ts, and the in-app developer docs.
http.route({ path: "/api/v1/me", method: "GET", handler: meHandler });
http.route({ path: "/api/v1/summary", method: "GET", handler: summaryHandler });
http.route({ path: "/api/v1/households", method: "GET", handler: householdsHandler });
http.route({ pathPrefix: "/api/v1/households/", method: "GET", handler: householdByIdHandler });
http.route({ path: "/api/v1/people", method: "GET", handler: peopleHandler });
http.route({ pathPrefix: "/api/v1/people/", method: "GET", handler: personByIdHandler });
http.route({ path: "/api/v1/transactions", method: "GET", handler: transactionsHandler });

// Write endpoints (403 insufficient_scope for read-only keys).
http.route({ path: "/api/v1/households", method: "POST", handler: createHouseholdHandler });
http.route({ pathPrefix: "/api/v1/households/", method: "PATCH", handler: updateHouseholdHandler });
// POST /api/v1/households/:id/members and /api/v1/households/:id/ledger.
http.route({
  pathPrefix: "/api/v1/households/",
  method: "POST",
  handler: householdSubresourceHandler,
});
http.route({ path: "/api/v1/people", method: "POST", handler: createPersonHandler });
http.route({ pathPrefix: "/api/v1/people/", method: "PATCH", handler: updatePersonHandler });

export default http;
