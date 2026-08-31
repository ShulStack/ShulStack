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

const http = httpRouter();

auth.addHttpRoutes(http);

// The public read-only API, keyed by institution-scoped API keys.
// See httpApi.ts and the in-app developer docs.
http.route({ path: "/api/v1/me", method: "GET", handler: meHandler });
http.route({ path: "/api/v1/summary", method: "GET", handler: summaryHandler });
http.route({ path: "/api/v1/households", method: "GET", handler: householdsHandler });
http.route({ pathPrefix: "/api/v1/households/", method: "GET", handler: householdByIdHandler });
http.route({ path: "/api/v1/people", method: "GET", handler: peopleHandler });
http.route({ pathPrefix: "/api/v1/people/", method: "GET", handler: personByIdHandler });
http.route({ path: "/api/v1/transactions", method: "GET", handler: transactionsHandler });

export default http;
