/**
 * The pledge pipeline: one ordered registry that the Convex schema, backend
 * functions, and board UI all derive stage identity from (mirrors modules.ts).
 */
export const PLEDGE_STAGES = [
  { slug: "prospect", label: "Prospect", open: true },
  { slug: "cultivating", label: "Cultivating", open: true },
  { slug: "asked", label: "Asked", open: true },
  { slug: "pledged", label: "Pledged", open: true },
  { slug: "fulfilled", label: "Fulfilled", open: false },
  { slug: "declined", label: "Declined", open: false },
] as const;

export type PledgeStage = (typeof PLEDGE_STAGES)[number]["slug"];

export const PLEDGE_STAGE_SLUGS = PLEDGE_STAGES.map((stage) => stage.slug) as PledgeStage[];

/** Stages that still need work — everything before a resolution. */
export const OPEN_PLEDGE_STAGES: readonly PledgeStage[] = PLEDGE_STAGES.filter(
  (stage) => stage.open,
).map((stage) => stage.slug);

export function isPledgeStage(value: string): value is PledgeStage {
  return (PLEDGE_STAGE_SLUGS as string[]).includes(value);
}

export function pledgeStageLabel(stage: PledgeStage): string {
  return PLEDGE_STAGES.find((entry) => entry.slug === stage)?.label ?? stage;
}
