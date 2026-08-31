"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";
import { errorMessage, formatTimestamp } from "../../../../../lib/format";

export default function ApiKeysPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  const params = useParams<{ slug: string }>();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="API keys require the admin role." title="Admins only" />;
  }
  return (
    <>
      <PageHeader
        description="Institution-scoped keys for the HTTP API (and the MCP server to come). Keys are read-only unless granted the write scope. Secrets are shown once and stored hashed."
        title="API keys"
        actions={
          <Link className="button secondary" href={`/app/${params.slug}/developer/docs`}>
            API docs
          </Link>
        }
      />
      <CreateKeyCard institutionId={workspace.institution._id} />
      <KeyListCard institutionId={workspace.institution._id} />
    </>
  );
}

function CreateKeyCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const createApiKey = useMutation(api.developer.createApiKey);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "read_write">("read");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <Card title="Create a key">
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSecret(null);
          setPending(true);
          createApiKey({
            institutionId,
            name,
            scopes: scope === "read_write" ? ["read", "write"] : ["read"],
          })
            .then((created) => {
              setSecret(created.secret);
              setName("");
              setScope("read");
            })
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
      >
        <Field hint="What will use it, e.g. “Campaign dashboard”." label="Key name">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setName(event.target.value)}
              placeholder="Campaign dashboard"
              required
              value={name}
            />
          )}
        </Field>
        <Field hint="Write keys can create and update records." label="Access">
          {(id) => (
            <select
              id={id}
              onChange={(event) => setScope(event.target.value as typeof scope)}
              value={scope}
            >
              <option value="read">Read-only</option>
              <option value="read_write">Read &amp; write</option>
            </select>
          )}
        </Field>
        <Button disabled={pending} type="submit">
          Create key
        </Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
      {secret === null ? null : <SecretReveal secret={secret} />}
    </Card>
  );
}

function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret-reveal">
      <p className="form-success">
        Key created. Copy it now — this is the only time it will be shown.
      </p>
      <div className="copy-row">
        <code className="code-inline">{secret}</code>
        <Button
          onClick={() => {
            navigator.clipboard
              .writeText(secret)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          variant="secondary"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function KeyListCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const keys = useQuery(api.developer.listApiKeys, { institutionId });
  const revokeApiKey = useMutation(api.developer.revokeApiKey);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Keys">
      {error === null ? null : <p className="form-error">{error}</p>}
      {keys === undefined ? (
        <p className="muted">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="muted">No keys yet. Create one above to call the API.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Scope</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.apiKeyId}>
                <td>
                  {key.name}
                  <span className="muted"> · {key.createdByEmail ?? "unknown"}</span>
                </td>
                <td>
                  <code className="code-inline">{key.keyPrefix}…</code>
                </td>
                <td>
                  <Badge tone={key.scopes.includes("write") ? "warning" : "neutral"}>
                    {key.scopes.includes("write") ? "read + write" : "read"}
                  </Badge>
                </td>
                <td>{formatTimestamp(key.createdAt)}</td>
                <td>{key.lastUsedAt === undefined ? "never" : formatTimestamp(key.lastUsedAt)}</td>
                <td>
                  <Badge tone={key.revokedAt === undefined ? "positive" : "neutral"}>
                    {key.revokedAt === undefined ? "active" : "revoked"}
                  </Badge>
                </td>
                <td className="table-actions">
                  {key.revokedAt === undefined ? (
                    <Button
                      onClick={() => {
                        if (!window.confirm(`Revoke “${key.name}”? This cannot be undone.`)) {
                          return;
                        }
                        setError(null);
                        revokeApiKey({ apiKeyId: key.apiKeyId }).catch((caught) =>
                          setError(errorMessage(caught)),
                        );
                      }}
                      variant="danger"
                    >
                      Revoke
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
