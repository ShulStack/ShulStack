import type { api } from "@shulstack/convex/_generated/api";
import { formatMoney } from "@shulstack/platform";
import { Card } from "@shulstack/ui";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

import { PledgeStageBadge } from "./pledge-badges";

type JoinedPledges = NonNullable<
  FunctionReturnType<typeof api.fundraising.listPledgesForHousehold>
>;

/** The compact pledges table shown on person and household pages. */
export function PledgesCard({
  pledges,
  slug,
}: {
  pledges: JoinedPledges | null | undefined;
  slug: string;
}) {
  return (
    <Card title="Pledges">
      {pledges === undefined ? (
        <p className="muted">Loading…</p>
      ) : pledges === null || pledges.length === 0 ? (
        <p className="muted">No pledges yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Stage</th>
              <th>Pledged</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {pledges.map((pledge) => (
              <tr key={pledge.pledgeId}>
                <td>
                  <Link href={`/app/${slug}/fundraising/${pledge.campaignId}`}>
                    {pledge.campaignName}
                  </Link>
                  {pledge.personName === undefined ? null : (
                    <span className="muted"> · {pledge.personName}</span>
                  )}
                </td>
                <td>
                  <PledgeStageBadge stage={pledge.stage} />
                </td>
                <td>{pledge.amountMinor === 0 ? "—" : formatMoney(pledge.amountMinor)}</td>
                <td>{formatMoney(pledge.paidMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
