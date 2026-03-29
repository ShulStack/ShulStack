// src/index.ts
import { DEFAULT_DATABASE_URL } from "@shulstack/platform";
import { run } from "graphile-worker";

// src/tasks/index.ts
var taskList = {
  heartbeat: async (payload, helpers) => {
    helpers.logger.info("Processed heartbeat job", payload);
  }
};

// src/index.ts
var connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
var main = async () => {
  const runner = await run({
    connectionString,
    concurrency: 5,
    pollInterval: 1500,
    taskList
  });
  const shutdown = async (signal) => {
    console.info(`[worker] shutting down after ${signal}`);
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  console.info("[worker] Graphile Worker started");
};
void main().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
