"use client";

import { EmptyState, PageHeader } from "@shulstack/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";
import { apiBaseUrl } from "../../../../../lib/api-url";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

type Endpoint = {
  path: string;
  summary: string;
  params?: string;
};

const ENDPOINTS: Endpoint[] = [
  { path: "/me", summary: "Introspect the key: its name, institution, and scopes." },
  {
    path: "/summary",
    summary: "Active household/people counts plus outstanding and credit balance totals.",
  },
  {
    path: "/households",
    summary: "List households, newest first.",
    params: "limit, cursor, active=true, search",
  },
  {
    path: "/households/{id}",
    summary: "One household with members and its billing profile.",
  },
  {
    path: "/households/{id}/ledger",
    summary: "The household's ledger entries, newest date first.",
    params: "limit, cursor, from, to",
  },
  {
    path: "/people",
    summary: "List people, newest first.",
    params: "limit, cursor, active=true, search",
  },
  { path: "/people/{id}", summary: "One person with their household memberships." },
  {
    path: "/transactions",
    summary: "Every ledger entry in the institution, newest date first.",
    params: "limit, cursor, from, to",
  },
];

export default function ApiDocsPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  const params = useParams<{ slug: string }>();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="API docs require the admin role." title="Admins only" />;
  }
  const base = apiBaseUrl(CONVEX_URL);

  return (
    <>
      <PageHeader
        description="The read-only HTTP API, v1. Everything is scoped to this institution by the key itself — no institution parameter, no way to reach anyone else's data."
        title="API reference"
        actions={
          <Link className="button secondary" href={`/app/${params.slug}/developer/api-keys`}>
            Manage keys
          </Link>
        }
      />

      <section className="card">
        <h2>Base URL & authentication</h2>
        <p className="muted">
          Send your key in the Authorization header on every request. Keys are for servers and
          scripts — never ship one in a browser or mobile app.
        </p>
        <pre className="code-block">{`curl -H "Authorization: Bearer ssk_..." \\
  ${base}/me`}</pre>
      </section>

      <section className="card">
        <h2>Endpoints</h2>
        <p className="muted">All endpoints are GET and return JSON.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Returns</th>
              <th>Query params</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((endpoint) => (
              <tr key={endpoint.path}>
                <td>
                  <code className="code-inline">{endpoint.path}</code>
                </td>
                <td>{endpoint.summary}</td>
                <td className="muted">{endpoint.params ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Conventions</h2>
        <ul className="muted docs-list">
          <li>
            <strong>Pagination:</strong> pass <code className="code-inline">limit</code> (1–200,
            default 50); responses include a <code className="code-inline">cursor</code> — pass it
            back to get the next page. <code className="code-inline">cursor</code> is{" "}
            <code className="code-inline">null</code> on the last page. Searches return a single
            page.
          </li>
          <li>
            <strong>Dates:</strong> <code className="code-inline">from</code> /{" "}
            <code className="code-inline">to</code> are inclusive calendar dates,{" "}
            <code className="code-inline">YYYY-MM-DD</code>.
          </li>
          <li>
            <strong>Money:</strong> integer minor units (cents), never floats.{" "}
            <code className="code-inline">amountMinor</code> is always positive;{" "}
            <code className="code-inline">balanceDeltaMinor</code> carries the signed effect on the
            household balance (charges positive, payments and credits negative).
          </li>
          <li>
            <strong>Errors:</strong>{" "}
            <code className="code-inline">{'{ "error": { "code", "message" } }'}</code> with 401
            (bad key), 404 (missing or not yours — indistinguishable by design), or 400 (bad
            parameters).
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Example: campaign pull</h2>
        <p className="muted">All payments recorded this calendar year, 200 at a time:</p>
        <pre className="code-block">{`curl -H "Authorization: Bearer ssk_..." \\
  "${base}/transactions?from=2026-01-01&limit=200"`}</pre>
        <p className="muted">Every active household with an outstanding balance:</p>
        <pre className="code-block">{`curl -H "Authorization: Bearer ssk_..." \\
  "${base}/households?active=true" \\
  | jq '.data[] | {id, displayName}'`}</pre>
      </section>
    </>
  );
}
