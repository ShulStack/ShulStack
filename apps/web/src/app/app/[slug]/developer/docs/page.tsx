"use client";

import { EmptyState, PageHeader } from "@shulstack/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";
import { apiBaseUrl } from "../../../../../lib/api-url";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

type Endpoint = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  summary: string;
  params?: string;
};

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/me", summary: "Introspect the key: its name, institution, and scopes." },
  {
    method: "GET",
    path: "/summary",
    summary: "Active household/people counts plus outstanding and credit balance totals.",
  },
  {
    method: "GET",
    path: "/households",
    summary: "List households, newest first.",
    params: "limit, cursor, active=true, search",
  },
  {
    method: "POST",
    path: "/households",
    summary: "Create a household. Body: displayName (required), householdType?, joinedAt?.",
  },
  {
    method: "GET",
    path: "/households/{id}",
    summary: "One household with members and its billing profile.",
  },
  {
    method: "PATCH",
    path: "/households/{id}",
    summary:
      "Update a household. Body: any of displayName, householdType, billingAccountType, mailLabel, billingMailLabel, joinedAt, resignedAt, isActive.",
  },
  {
    method: "GET",
    path: "/households/{id}/ledger",
    summary: "The household's ledger entries, newest date first.",
    params: "limit, cursor, from, to",
  },
  {
    method: "POST",
    path: "/households/{id}/ledger",
    summary:
      "Record a ledger entry and move the balance. Body: entryType (charge | payment | credit), amountMinor, occurredAt, category?, method?, memo?.",
  },
  {
    method: "POST",
    path: "/households/{id}/members",
    summary:
      "Add a person to a household (reactivates an existing membership). Body: personId, role?, isPrimaryContact?, isBillingContact?, isMailRecipient?.",
  },
  {
    method: "GET",
    path: "/people",
    summary: "List people, newest first.",
    params: "limit, cursor, active=true, search",
  },
  {
    method: "POST",
    path: "/people",
    summary:
      "Create a person. Body: name fields (firstName, lastName, title, nickname, hebrew* …), gender?, dateOfBirth?.",
  },
  { method: "GET", path: "/people/{id}", summary: "One person with their household memberships." },
  {
    method: "PATCH",
    path: "/people/{id}",
    summary:
      "Update a person. Body: the POST fields plus honoraryMember, eligibleForAliyah, isDeceased, isActive.",
  },
  {
    method: "GET",
    path: "/transactions",
    summary: "Every ledger entry in the institution, newest date first.",
    params: "limit, cursor, from, to",
  },
  {
    method: "GET",
    path: "/analytics/households",
    summary:
      "Per-household giving rollups: rank and filter by payments, charges, credits, or net over a date range or category, with thresholds and a matched-total summary.",
    params: "metric, from, to, category, min, max, order, active=true, limit",
  },
  {
    method: "GET",
    path: "/analytics/categories",
    summary: "Charged/paid/credited totals per ledger category over an optional date range.",
    params: "from, to",
  },
  {
    method: "GET",
    path: "/campaigns",
    summary: "Fundraising campaigns with pledge rollups (committed, raised, open pipeline).",
  },
  {
    method: "GET",
    path: "/pledges",
    summary: "Pledges joined to household/person/campaign names, with stage and amounts.",
    params: "campaignId, stage, open=true",
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
        description="The HTTP API, v1. Everything is scoped to this institution by the key itself — no institution parameter, no way to reach anyone else's data. Reads work with any key; writes need a key with the write scope."
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
        <p className="muted">
          All endpoints speak JSON: GET reads, POST creates (201), PATCH updates (200). POST and
          PATCH take a JSON object body and need the write scope.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Summary</th>
              <th>Query params</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((endpoint) => (
              <tr key={`${endpoint.method} ${endpoint.path}`}>
                <td>
                  <code className="code-inline">{endpoint.method}</code>
                </td>
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
            <strong>Scopes:</strong> every key can read; only keys created with the write scope can
            POST/PATCH. A read-only key calling a write endpoint gets 403 with code{" "}
            <code className="code-inline">insufficient_scope</code>.
          </li>
          <li>
            <strong>Errors:</strong>{" "}
            <code className="code-inline">{'{ "error": { "code", "message" } }'}</code> with 401
            (bad key), 403 (key lacks the write scope), 404 (missing or not yours —
            indistinguishable by design), or 400 (bad parameters, or a malformed body — code{" "}
            <code className="code-inline">invalid_body</code>).
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
