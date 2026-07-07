"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Doc, Id } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "../../../../../lib/format";

export default function PersonDetailPage() {
  const params = useParams<{ slug: string; personId: string }>();
  const personId = params.personId as Id<"people">;
  const details = useQuery(api.crm.getPerson, { personId });

  if (details === undefined) {
    return <p className="muted">Loading…</p>;
  }
  if (details === null) {
    return (
      <EmptyState
        action={
          <Link className="button secondary" href={`/app/${params.slug}/people`}>
            Back to people
          </Link>
        }
        title="Person not found"
      />
    );
  }

  const { person, memberships } = details;
  return (
    <>
      <PageHeader
        actions={<PersonStatusToggle person={person} />}
        description={person.personType ?? undefined}
        title={person.displayName}
      />
      <EditPersonForm person={person} />
      <Card title="Households">
        {memberships.length === 0 ? (
          <p className="muted">Not linked to any household.</p>
        ) : (
          <ul className="activity-list">
            {memberships.map((membership) => (
              <li key={membership.membershipId}>
                <span>
                  <Link href={`/app/${params.slug}/households/${membership.householdId}`}>
                    {membership.householdName}
                  </Link>{" "}
                  <span className="muted">as {membership.role.replace("_", " ")}</span>
                </span>
                <Badge tone={membership.isActive ? "positive" : "neutral"}>
                  {membership.isActive ? "active" : "inactive"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function PersonStatusToggle({ person }: { person: Doc<"people"> }) {
  const setActive = useMutation(api.crm.setPersonActive);
  return (
    <div className="header-status">
      <Badge tone={person.isActive ? "positive" : "neutral"}>
        {person.isActive ? "active" : "inactive"}
      </Badge>
      <Button
        onClick={() => void setActive({ personId: person._id, isActive: !person.isActive })}
        variant={person.isActive ? "danger" : "secondary"}
      >
        {person.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}

const GENDERS = ["unknown", "female", "male", "nonbinary"] as const;

function EditPersonForm({ person }: { person: Doc<"people"> }) {
  const updatePerson = useMutation(api.crm.updatePerson);
  const [firstName, setFirstName] = useState(person.firstName ?? "");
  const [lastName, setLastName] = useState(person.lastName ?? "");
  const [nickname, setNickname] = useState(person.nickname ?? "");
  const [gender, setGender] = useState(person.gender);
  const [dateOfBirth, setDateOfBirth] = useState(person.dateOfBirth ?? "");
  const [hebrewGivenName, setHebrewGivenName] = useState(person.hebrewGivenName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card title="Details">
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSaved(false);
          updatePerson({
            personId: person._id,
            firstName,
            lastName,
            nickname,
            gender,
            ...(dateOfBirth === "" ? {} : { dateOfBirth }),
            hebrewGivenName,
          })
            .then(() => setSaved(true))
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <div className="inline-form">
          <Field label="First name">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setFirstName(event.target.value)}
                value={firstName}
              />
            )}
          </Field>
          <Field label="Last name">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setLastName(event.target.value)}
                value={lastName}
              />
            )}
          </Field>
          <Field label="Nickname">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setNickname(event.target.value)}
                value={nickname}
              />
            )}
          </Field>
        </div>
        <div className="inline-form">
          <Field label="Gender">
            {(id) => (
              <select
                id={id}
                onChange={(event) => setGender(event.target.value as typeof gender)}
                value={gender}
              >
                {GENDERS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Date of birth">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setDateOfBirth(event.target.value)}
                type="date"
                value={dateOfBirth}
              />
            )}
          </Field>
          <Field label="Hebrew name">
            {(id) => (
              <input
                dir="auto"
                id={id}
                onChange={(event) => setHebrewGivenName(event.target.value)}
                value={hebrewGivenName}
              />
            )}
          </Field>
        </div>
        {error === null ? null : <p className="form-error">{error}</p>}
        {saved ? <p className="form-success">Saved.</p> : null}
        <div>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </Card>
  );
}
