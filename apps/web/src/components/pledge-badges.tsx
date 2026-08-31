import { type PledgeStage, pledgeStageLabel } from "@shulstack/platform";
import { Badge } from "@shulstack/ui";

const STAGE_TONE: Record<PledgeStage, "neutral" | "positive" | "warning" | "negative"> = {
  prospect: "neutral",
  cultivating: "neutral",
  asked: "warning",
  pledged: "warning",
  fulfilled: "positive",
  declined: "neutral",
};

export function PledgeStageBadge({ stage }: { stage: PledgeStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{pledgeStageLabel(stage)}</Badge>;
}
