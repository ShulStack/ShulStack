"use client";

import { api } from "@shulstack/convex/_generated/api";
import { isValidSlug, slugify } from "@shulstack/platform";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SignInForm } from "../../components/sign-in-form";
import { errorMessage } from "../../lib/format";

export default function InstitutionsPage() {
  return (
    <main className="shell narrow">
      <PageHeader
        title="Your institutions"
        description="Pick an institution to manage, or set up a new one."
      />
      <AuthLoading>
        <p className="muted">Checking session…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <Authenticated>
        <InstitutionList />
      </Authenticated>
    </main>
  );
}

function InstitutionList() {
  const institutions = useQuery(api.platform.listMyInstitutions, {});

  if (institutions === undefined) {
    return <p className="muted">Loading…</p>;
  }
  return (
    <>
      {institutions.length === 0 ? (
        <EmptyState
          title="No institutions yet"
          description="Create your congregation's workspace below. You'll become its owner."
        />
      ) : (
        <div className="institution-list">
          {institutions.map((institution) => (
            <Link
              className="institution-link"
              href={`/app/${institution.slug}`}
              key={institution.institutionId}
            >
              <span>
                <strong>{institution.name}</strong>
                <span className="muted"> /{institution.slug}</span>
              </span>
              <Badge tone={institution.role === "staff" ? "neutral" : "positive"}>
                {institution.role}
              </Badge>
            </Link>
          ))}
        </div>
      )}
      <CreateInstitutionForm />
    </>
  );
}

function CreateInstitutionForm() {
  const router = useRouter();
  const createInstitution = useMutation(api.platform.createInstitution);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <Card title="Create an institution">
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setPending(true);
          createInstitution({ slug: effectiveSlug, name })
            .then((created) => router.push(`/app/${created.slug}`))
            .catch((caught) => {
              setError(errorMessage(caught));
              setPending(false);
            });
        }}
      >
        <Field label="Name">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setName(event.target.value)}
              placeholder="Congregation Beth Shalom"
              required
              value={name}
            />
          )}
        </Field>
        <Field hint="Lowercase letters, numbers, and hyphens. Used in links." label="URL slug">
          {(id) => (
            <input
              id={id}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              placeholder="beth-shalom"
              required
              value={effectiveSlug}
            />
          )}
        </Field>
        {error === null ? null : <p className="form-error">{error}</p>}
        <div>
          <Button disabled={pending || !isValidSlug(effectiveSlug)} type="submit">
            Create institution
          </Button>
        </div>
      </form>
    </Card>
  );
}
