"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Doc, Id } from "@shulstack/convex/_generated/dataModel";
import { formatMoney, parseMoney } from "@shulstack/platform";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { errorMessage, formatIsoDate, todayIsoDate } from "../../../../../lib/format";

export default function HouseholdDetailPage() {
  const params = useParams<{ slug: string; householdId: string }>();
  const householdId = params.householdId as Id<"households">;
  const details = useQuery(api.crm.getHousehold, { householdId });

  if (details === undefined) {
    return <p className="muted">Loading…</p>;
  }
  if (details === null) {
    return (
      <EmptyState
        action={
          <Link className="button secondary" href={`/app/${params.slug}/households`}>
            Back to households
          </Link>
        }
        title="Household not found"
      />
    );
  }

  const { household, members, billingProfile } = details;
  return (
    <>
      <PageHeader
        actions={<HouseholdStatusToggle household={household} />}
        description={household.householdType ?? undefined}
        title={household.displayName}
      />
      {household.joinedAt === undefined ? null : (
        <p className="muted">Member since {formatIsoDate(household.joinedAt)}</p>
      )}
      <MembersCard
        householdId={household._id}
        institutionId={household.institutionId}
        members={members}
        slug={params.slug}
      />
      <BillingCard billingProfile={billingProfile} householdId={household._id} />
    </>
  );
}

function HouseholdStatusToggle({ household }: { household: Doc<"households"> }) {
  const setActive = useMutation(api.crm.setHouseholdActive);
  return (
    <div className="header-status">
      <Badge tone={household.isActive ? "positive" : "neutral"}>
        {household.isActive ? "active" : "inactive"}
      </Badge>
      <Button
        onClick={() =>
          void setActive({ householdId: household._id, isActive: !household.isActive })
        }
        variant={household.isActive ? "danger" : "secondary"}
      >
        {household.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}

type Member = {
  membershipId: Id<"householdMembers">;
  personId: Id<"people">;
  displayName: string;
  role: string;
  isPrimaryContact: boolean;
  isActive: boolean;
};

function MembersCard({
  institutionId,
  householdId,
  members,
  slug,
}: {
  institutionId: Id<"institutions">;
  householdId: Id<"households">;
  members: Member[];
  slug: string;
}) {
  const setMemberActive = useMutation(api.crm.setHouseholdMemberActive);

  return (
    <Card title="Members">
      {members.length === 0 ? (
        <p className="muted">No members linked yet. Add one below.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId}>
                <td>
                  <Link href={`/app/${slug}/people/${member.personId}`}>{member.displayName}</Link>
                  {member.isPrimaryContact ? <Badge tone="warning">primary</Badge> : null}
                </td>
                <td className="muted">{member.role.replace("_", " ")}</td>
                <td>
                  <Badge tone={member.isActive ? "positive" : "neutral"}>
                    {member.isActive ? "active" : "inactive"}
                  </Badge>
                </td>
                <td className="table-actions">
                  <Button
                    onClick={() =>
                      void setMemberActive({
                        membershipId: member.membershipId,
                        isActive: !member.isActive,
                      })
                    }
                    variant="secondary"
                  >
                    {member.isActive ? "Remove" : "Restore"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <AddMemberForm householdId={householdId} institutionId={institutionId} />
    </Card>
  );
}

const MEMBER_ROLES = ["head", "spouse", "child", "dependent_adult", "other"] as const;

function AddMemberForm({
  institutionId,
  householdId,
}: {
  institutionId: Id<"institutions">;
  householdId: Id<"households">;
}) {
  const addMember = useMutation(api.crm.addHouseholdMember);
  const createPerson = useMutation(api.crm.createPerson);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<(typeof MEMBER_ROLES)[number]>("other");
  const [error, setError] = useState<string | null>(null);
  const matches = useQuery(
    api.crm.searchPeople,
    search.trim() === "" ? "skip" : { institutionId, query: search },
  );

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  return (
    <div className="add-member">
      <h3>Add a member</h3>
      <div className="inline-form">
        <Field label="Find an existing person">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people…"
              type="search"
              value={search}
            />
          )}
        </Field>
        <Field label="Role">
          {(id) => (
            <select
              id={id}
              onChange={(event) => setRole(event.target.value as typeof role)}
              value={role}
            >
              {MEMBER_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option.replace("_", " ")}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {matches !== undefined && matches.length > 0 ? (
        <ul className="search-results">
          {matches.map((person) => (
            <li key={person._id}>
              <span>{person.displayName}</span>
              <Button
                onClick={() => {
                  setError(null);
                  addMember({ householdId, personId: person._id, role })
                    .then(() => setSearch(""))
                    .catch((caught) => setError(errorMessage(caught)));
                }}
                variant="secondary"
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          createPerson({ institutionId, firstName: newFirstName, lastName: newLastName })
            .then((personId) => addMember({ householdId, personId, role }))
            .then(() => {
              setNewFirstName("");
              setNewLastName("");
            })
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <Field label="Or create a new person — first name">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setNewFirstName(event.target.value)}
              required
              value={newFirstName}
            />
          )}
        </Field>
        <Field label="Last name">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setNewLastName(event.target.value)}
              value={newLastName}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Create and add
        </Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
    </div>
  );
}

const LEDGER_TYPES = ["charge", "payment", "credit"] as const;

const LEDGER_TONE = {
  charge: "warning",
  payment: "positive",
  credit: "positive",
  opening_balance: "neutral",
} as const;

function BillingCard({
  billingProfile,
  householdId,
}: {
  billingProfile: Doc<"householdBillingProfiles"> | null;
  householdId: Id<"households">;
}) {
  const addLedgerEntry = useMutation(api.ledger.addLedgerEntry);
  const entries = usePaginatedQuery(
    api.ledger.listLedgerEntries,
    { householdId },
    { initialNumItems: 25 },
  );
  const [entryType, setEntryType] = useState<(typeof LEDGER_TYPES)[number]>("charge");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIsoDate());
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currency = billingProfile?.currency ?? "USD";
  return (
    <Card title="Billing">
      <div className="stat-grid">
        <div className="stat">
          <p className="stat-label">Current balance</p>
          <p className="stat-value">
            {billingProfile === null ? "—" : formatMoney(billingProfile.balanceMinor, currency)}
          </p>
          {billingProfile?.balanceAsOf === undefined ? null : (
            <p className="muted stat-hint">as of {formatIsoDate(billingProfile.balanceAsOf)}</p>
          )}
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          let amountMinor: number;
          try {
            amountMinor = parseMoney(amount, currency);
          } catch (caught) {
            setError(errorMessage(caught));
            return;
          }
          addLedgerEntry({
            householdId,
            entryType,
            amountMinor,
            occurredAt,
            ...(detail.trim() === ""
              ? {}
              : entryType === "payment"
                ? { method: detail.trim() }
                : { category: detail.trim() }),
          })
            .then(() => {
              setAmount("");
              setDetail("");
            })
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <Field label="Type">
          {(id) => (
            <select
              id={id}
              onChange={(event) => setEntryType(event.target.value as typeof entryType)}
              value={entryType}
            >
              {LEDGER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Amount">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="425.00"
              required
              value={amount}
            />
          )}
        </Field>
        <Field label="Date">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
              type="date"
              value={occurredAt}
            />
          )}
        </Field>
        <Field label={entryType === "payment" ? "Method" : "Category"}>
          {(id) => (
            <input
              id={id}
              onChange={(event) => setDetail(event.target.value)}
              placeholder={entryType === "payment" ? "check" : "dues"}
              value={detail}
            />
          )}
        </Field>
        <Button type="submit">Record {entryType}</Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
      {entries.results.length === 0 ? (
        <p className="muted">No ledger activity yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Detail</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.results.map((entry) => {
              const signed =
                entry.entryType === "payment" || entry.entryType === "credit"
                  ? -entry.amountMinor
                  : entry.amountMinor;
              return (
                <tr key={entry._id}>
                  <td className="muted">{formatIsoDate(entry.occurredAt)}</td>
                  <td>
                    <Badge tone={LEDGER_TONE[entry.entryType]}>
                      {entry.entryType.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="muted">{entry.category ?? entry.method ?? entry.memo ?? "—"}</td>
                  <td>{formatMoney(signed, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {entries.status === "CanLoadMore" ? (
        <Button onClick={() => entries.loadMore(25)} variant="secondary">
          Load more
        </Button>
      ) : null}
    </Card>
  );
}
