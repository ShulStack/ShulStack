import { api } from "@shulstack/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { renderMarkdownLite } from "../../../../lib/markdown";

// Public pages are cached and revalidated instead of rendered per request;
// edits to a published page show up within five minutes.
export const revalidate = 300;

type PublicPageProps = {
  params: Promise<{ slug: string; page: string }>;
};

export async function generateMetadata({ params }: PublicPageProps): Promise<Metadata> {
  const { slug, page } = await params;
  const document = await fetchQuery(api.content.getPublishedPage, {
    institutionSlug: slug,
    slug: page,
  });
  if (document === null) {
    return {};
  }
  return {
    title: document.seoTitle ?? document.title,
    description: document.seoDescription ?? document.summary,
  };
}

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
        <p className="eyebrow">
          <Link href={`/sites/${slug}`}>Home</Link>
        </p>
        <h1>{document.title}</h1>
        {document.summary === undefined ? null : <p className="muted">{document.summary}</p>}
        {document.layout.map((block, index) =>
          typeof block.body === "string" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: layout blocks have no ids
            <section className="public-block" key={index}>
              {renderMarkdownLite(block.body).map((rendered, blockIndex) => {
                const key = blockIndex;
                switch (rendered.kind) {
                  case "h2":
                    return <h2 key={key}>{rendered.text}</h2>;
                  case "h3":
                    return <h3 key={key}>{rendered.text}</h3>;
                  case "ul":
                    return (
                      <ul key={key}>
                        {rendered.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    );
                  default:
                    return <p key={key}>{rendered.text}</p>;
                }
              })}
            </section>
          ) : null,
        )}
      </article>
    </main>
  );
}
