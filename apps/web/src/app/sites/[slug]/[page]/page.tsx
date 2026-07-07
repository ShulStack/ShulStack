import { api } from "@shulstack/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PublicPageProps = {
  params: Promise<{ slug: string; page: string }>;
};

/**
 * The public rendering of a published CMS page, server-rendered per request.
 * Draft and archived pages 404.
 */
export default async function PublicSitePage({ params }: PublicPageProps) {
  const { slug, page } = await params;
  const document = await fetchQuery(api.content.getPublishedPage, {
    institutionSlug: slug,
    slug: page,
  });
  if (document === null) {
    notFound();
  }

  return (
    <main className="shell narrow">
      <article className="public-page">
        <h1>{document.title}</h1>
        {document.summary === undefined ? null : <p className="muted">{document.summary}</p>}
        {document.layout.map((block, index) =>
          typeof block.body === "string" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: layout blocks have no ids
            <p className="public-block" key={index}>
              {block.body}
            </p>
          ) : null,
        )}
      </article>
    </main>
  );
}
