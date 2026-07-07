import { convexTest, type TestConvex } from "convex-test";
import { vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

export const modules = Object.fromEntries(
  Object.entries(import.meta.glob("../../convex/**/*.{js,ts}")).filter(
    ([path]) => !path.endsWith(".d.ts"),
  ),
);

export type Backend = TestConvex<typeof schema>;

export function createBackend(): Backend {
  return convexTest(schema, modules);
}

/**
 * Create an auth user directly (tests don't exercise the password provider)
 * and return a client acting as them. Convex Auth's getAuthUserId reads the
 * user id from the JWT subject.
 */
export async function signUp(t: Backend, email: string) {
  const userId = await t.run(
    async (ctx) => await ctx.db.insert("users", { email, name: email.split("@")[0] }),
  );
  return { userId, as: t.withIdentity({ subject: userId }) };
}

export async function createInstitutionAs(
  actor: ReturnType<Backend["withIdentity"]>,
  slug = "beth-test",
  name = "Congregation Test",
) {
  const { institutionId } = await actor.mutation(api.platform.createInstitution, { slug, name });
  return institutionId as Id<"institutions">;
}

/** Run all scheduled functions (e.g. domain event processing) to completion. */
export async function settleScheduled(t: Backend): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

export const firstPage = { numItems: 50, cursor: null };
