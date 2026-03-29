import { DEFAULT_DATABASE_URL } from "@shulstack/platform";
import { run } from "graphile-worker";

import { taskList } from "./tasks";

const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const main = async () => {
  const runner = await run({
    connectionString,
    concurrency: 5,
    pollInterval: 1500,
    taskList,
  });

  const shutdown = async (signal: string) => {
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
