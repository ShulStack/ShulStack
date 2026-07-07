"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useWorkspace } from "../../../../components/use-workspace";
import { errorMessage } from "../../../../lib/format";

export default function PeoplePage() {
  const workspace = useWorkspace();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  return (
    <>
      <PageHeader description="Every individual in your community." title="People" />
      <CreatePersonForm institutionId={workspace.institution._id} />
      <PeopleList institutionId={workspace.institution._id} />
    </>
  );
}

function CreatePersonForm({ institutionId }: { institutionId: Id<"institutions"> }) {
  const createPerson = useMutation(api.crm.createPerson);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          createPerson({ institutionId, firstName, lastName })
            .then(() => {
              setFirstName("");
              setLastName("");
            })
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <Field label="First name">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setFirstName(event.target.value)}
              required
              value={firstName}
            />
          )}
        </Field>
        <Field label="Last name">
          {(id) => (
            <input id={id} onChange={(event) => setLastName(event.target.value)} value={lastName} />
          )}
        </Field>
        <Button type="submit">Add person</Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}

function PeopleList({ institutionId }: { institutionId: Id<"institutions"> }) {
  const params = useParams<{ slug: string }>();
  const [search, setSearch] = useState("");
  const searching = search.trim() !== "";

  const paginated = usePaginatedQuery(
    api.crm.listPeople,
    { institutionId },
    { initialNumItems: 25 },
  );
  const searchResults = useQuery(
    api.crm.searchPeople,
    searching ? { institutionId, query: search } : "skip",
  );
  const rows = searching ? (searchResults ?? []) : paginated.results;

  return (
    <Card title="All people">
      <input
        aria-label="Search people"
        className="search-input"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name…"
        type="search"
        value={search}
      />
      {rows.length === 0 ? (
        searching ? (
          <p className="muted">No people match “{search}”.</p>
        ) : paginated.status === "LoadingFirstPage" ? (
          <p className="muted">Loading…</p>
        ) : (
          <EmptyState description="Add your first person above." title="No people yet" />
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => (
              <tr key={person._id}>
                <td>
                  <Link href={`/app/${params.slug}/people/${person._id}`}>
                    {person.displayName}
                  </Link>
                </td>
                <td className="muted">{person.personType ?? "—"}</td>
                <td>
                  <Badge tone={person.isActive ? "positive" : "neutral"}>
                    {person.isActive ? "active" : "inactive"}
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
