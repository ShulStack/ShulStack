"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Doc } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";
import { errorMessage } from "../../../../../lib/format";

const STATUSES = ["draft", "published", "archived"] as const;

export default function PageEditorPage() {
  const params = useParams<{ slug: string; pageSlug: string }>();
  const workspace = useWorkspace();
  const page = useQuery(
    api.content.getPageForStaff,
    workspace === undefined || workspace === null
      ? "skip"
      : { institutionId: workspace.institution._id, slug: params.pageSlug },
  );

  if (workspace === undefined || workspace === null || page === undefined) {
    return <p className="muted">Loading…</p>;
  }
  if (page === null) {
    return (
      <EmptyState
        action={
          <Link className="button secondary" href={`/app/${params.slug}/website`}>
            Back to pages
          </Link>
        }
        title="Page not found"
      />
    );
  }
  // Key on updatedAt so a save re-initializes the editor from the stored page.
  return (
    <PageEditor
      key={`${page._id}:${page.updatedAt}`}
      page={page}
      siteSlug={workspace.institution.slug}
    />
  );
}

function PageEditor({ page, siteSlug }: { page: Doc<"pages">; siteSlug: string }) {
  const params = useParams<{ slug: string }>();
  const canAdminister = useCanAdminister();
  const upsertPage = useMutation(api.content.upsertPage);

  const [title, setTitle] = useState(page.title);
  const [summary, setSummary] = useState(page.summary ?? "");
  const [status, setStatus] = useState(page.status);
  const [blocks, setBlocks] = useState<string[]>(() => {
    const bodies = page.layout
      .map((block) => (typeof block.body === "string" ? block.body : null))
      .filter((body): body is string => body !== null);
    return bodies.length > 0 ? bodies : [""];
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (nextStatus: (typeof STATUSES)[number]) => {
    setError(null);
    setSaved(false);
    upsertPage({
      institutionId: page.institutionId,
      slug: page.slug,
      title,
      summary: summary.trim() === "" ? undefined : summary,
      layout: blocks
        .filter((body) => body.trim() !== "")
        .map((body) => ({ type: "markdown", body })),
      status: nextStatus,
    })
      .then(() => setSaved(true))
      .catch((caught) => setError(errorMessage(caught)));
  };

  return (
    <>
      <PageHeader
        actions={
          <div className="header-status">
            <Badge tone={status === "published" ? "positive" : "neutral"}>{status}</Badge>
            {page.status === "published" ? (
              <Link className="button secondary" href={`/sites/${siteSlug}/${page.slug}`}>
                View live
              </Link>
            ) : null}
            <Link className="button secondary" href={`/app/${params.slug}/website`}>
              All pages
            </Link>
          </div>
        }
        description={`/${page.slug}`}
        title={page.title}
      />
      <Card title="Page content">
        <div className="inline-form">
          <Field label="Title">
            {(id) => (
              <input
                disabled={!canAdminister}
                id={id}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            )}
          </Field>
          <Field label="Status">
            {(id) => (
              <select
                disabled={!canAdminister}
                id={id}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                value={status}
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Summary">
          {(id) => (
            <input
              disabled={!canAdminister}
              id={id}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Shown on the site index and in search results."
              value={summary}
            />
          )}
        </Field>
        <div className="block-editor">
          {blocks.map((body, index) => (
            <Field
              hint="Plain text with ## headings, ### subheadings, and - bullets."
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional
              key={index}
              label={`Section ${index + 1}`}
            >
              {(id) => (
                <>
                  <textarea
                    disabled={!canAdminister}
                    id={id}
                    onChange={(event) =>
                      setBlocks(blocks.map((b, i) => (i === index ? event.target.value : b)))
                    }
                    rows={6}
                    value={body}
                  />
                  {canAdminister && blocks.length > 1 ? (
                    <Button
                      onClick={() => setBlocks(blocks.filter((_, i) => i !== index))}
                      variant="danger"
                    >
                      Remove section
                    </Button>
                  ) : null}
                </>
              )}
            </Field>
          ))}
        </div>
        {canAdminister ? (
          <div className="auth-actions">
            <Button onClick={() => setBlocks([...blocks, ""])} variant="secondary">
              Add section
            </Button>
            <Button onClick={() => save(status)}>Save</Button>
            {status !== "published" ? (
              <Button onClick={() => save("published")}>Save and publish</Button>
            ) : null}
          </div>
        ) : (
          <p className="muted">Editing requires the admin role.</p>
        )}
        {error === null ? null : <p className="form-error">{error}</p>}
        {saved ? <p className="form-success">Saved.</p> : null}
      </Card>
    </>
  );
}
