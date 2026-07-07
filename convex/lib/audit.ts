import type { Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { auditActionValidator } from "./validators";

type AuditAction = Infer<typeof auditActionValidator>;

type AuditEntry = {
  institutionId: Id<"institutions">;
  actorUserId?: Id<"users">;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

/**
 * Audit writes happen inside the mutation that performed the change — never
 * through a client-callable endpoint — so the log cannot be forged.
 */
export async function logAudit(ctx: MutationCtx, entry: AuditEntry): Promise<void> {
  await ctx.db.insert("auditLogs", entry);
}
