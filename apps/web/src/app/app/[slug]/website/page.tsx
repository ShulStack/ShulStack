"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { isValidSlug, slugify } from "@shulstack/platform";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../components/use-workspace";
import { errorMessage, formatTimestamp } from "../../../../lib/format";

const STATUS_TONE = { draft: "neutral", published: "positive", archived: "warning" } as const;

export default function WebsitePage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  return (
    <>
      <PageHeader
        description="Pages on your public site. Drafts are only visible here."
        title="Website"
        actions={
          <Link className="button secondary" href={`/sites/${workspace.institution.slug}`}>
            View live site
          </Link>
        }
      />
      {canAdminister ? <CreatePageForm institutionId={workspace.institution._id} /> : null}
      <PageList institutionId={workspace.institution._id} siteSlug={workspace.institution.slug} />
    </>
  );
}

function CreatePageForm({ institutionId }: { institutionId: Id<"institutions"> }) {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const upsertPage = useMutation(api.content.upsertPage);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const slug = slugify(title);
          if (!isValidSlug(slug)) {
            setError("Give the page a title with at least one letter or number.");
            return;
          }
          upsertPage({ institutionId, slug, title: title.trim(), status: "draft" })
            .then(() => router.push(`/app/${params.slug}/website/${slug}`))
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <Field label="New page title">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="About Us"
              required
              value={title}
            />
          )}
        </Field>
        <Button type="submit">Create draft</Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}

function PageList({
  institutionId,
  siteSlug,
}: {
  institutionId: Id<"institutions">;
  siteSlug: string;
}) {
  const params = useParams<{ slug: string }>();
  const pages = useQuery(api.content.listPages, { institutionId });

  return (
    <Card title="All pages">
      {pages === undefined ? (
        <p className="muted">Loading…</p>
      ) : pages.length === 0 ? (
        <EmptyState
          description="Create your first page above — an About page is a good start."
          title="No pages yet"
        />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page._id}>
                <td>
                  <Link href={`/app/${params.slug}/website/${page.slug}`}>{page.title}</Link>
                </td>
                <td className="muted">/{page.slug}</td>
                <td>
                  <Badge tone={STATUS_TONE[page.status]}>{page.status}</Badge>
                </td>
                <td className="muted">{formatTimestamp(page.updatedAt)}</td>
                <td className="table-actions">
                  {page.status === "published" ? (
                    <Link className="button secondary" href={`/sites/${siteSlug}/${page.slug}`}>
                      View
                    </Link>
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
