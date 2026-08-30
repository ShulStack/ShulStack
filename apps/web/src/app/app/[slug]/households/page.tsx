"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useWorkspace } from "../../../../components/use-workspace";
import { errorMessage, formatIsoDate } from "../../../../lib/format";

export default function HouseholdsPage() {
  const workspace = useWorkspace();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  return (
    <>
      <PageHeader
        description="The billing and mailing units of your community."
        title="Households"
      />
      <CreateHouseholdForm institutionId={workspace.institution._id} />
      <HouseholdList institutionId={workspace.institution._id} />
    </>
  );
}

function CreateHouseholdForm({ institutionId }: { institutionId: Id<"institutions"> }) {
  const createHousehold = useMutation(api.crm.createHousehold);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setPending(true);
          createHousehold({ institutionId, displayName })
            .then(() => setDisplayName(""))
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
      >
        <Field label="New household">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Cohen Family"
              required
              value={displayName}
            />
          )}
        </Field>
        <Button disabled={pending} type="submit">
          Add household
        </Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}

function HouseholdList({ institutionId }: { institutionId: Id<"institutions"> }) {
  const params = useParams<{ slug: string }>();
  const [search, setSearch] = useState("");
  const searching = search.trim() !== "";

  const paginated = usePaginatedQuery(
    api.crm.listHouseholds,
    { institutionId },
    { initialNumItems: 25 },
  );
  const searchResults = useQuery(
    api.crm.searchHouseholds,
    searching ? { institutionId, query: search } : "skip",
  );

  const rows = searching ? (searchResults ?? []) : paginated.results;

  return (
    <Card title="All households">
      <input
        aria-label="Search households"
        className="search-input"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name…"
        type="search"
        value={search}
      />
      {rows.length === 0 ? (
        searching ? (
          <p className="muted">No households match “{search}”.</p>
        ) : paginated.status === "LoadingFirstPage" ? (
          <p className="muted">Loading…</p>
        ) : (
          <EmptyState description="Add your first household above." title="No households yet" />
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((household) => (
              <tr key={household._id}>
                <td>
                  <Link href={`/app/${params.slug}/households/${household._id}`}>
                    {household.displayName}
                  </Link>
                </td>
                <td className="muted">{household.householdType ?? "—"}</td>
                <td className="muted">
                  {household.joinedAt === undefined ? "—" : formatIsoDate(household.joinedAt)}
                </td>
                <td>
                  <Badge tone={household.isActive ? "positive" : "neutral"}>
                    {household.isActive ? "active" : "inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!searching && paginated.status === "CanLoadMore" ? (
        <Button onClick={() => paginated.loadMore(25)} variant="secondary">
          Load more
        </Button>
      ) : null}
    </Card>
  );
}
