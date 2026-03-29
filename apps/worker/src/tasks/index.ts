import type { TaskList } from "graphile-worker";

export const taskList: TaskList = {
  heartbeat: async (payload, helpers) => {
    helpers.logger.info("Processed heartbeat job", payload as Record<string, unknown>);
  },
};
