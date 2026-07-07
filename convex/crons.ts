import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Retry sweeper: emitDomainEvent schedules immediate processing, so this only
// picks up events whose handler failed on the first pass.
crons.interval(
  "process pending domain events",
  { minutes: 5 },
  internal.events.processPendingEvents,
  {},
);

export default crons;
