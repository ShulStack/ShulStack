import { api } from "@shulstack/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// Public pages are cached and revalidated instead of rendered per request;
// a publish shows up within five minutes.
export const revalidate = 300;

type SiteIndexProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: SiteIndexProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchQuery(api.content.listPublishedPages, { institutionSlug: slug });
  return site === null ? {} : { title: site.institutionName };
}

/** Public index of an institution's published pages. */
export default async function PublicSiteIndex({ params }: SiteIndexProps) {
  const { slug } = await params;
  const site = await fetchQuery(api.content.listPublishedPages, { institutionSlug: slug });
  if (site === null) {
    notFound();
  }

  return (
    <main className="shell narrow">
      <article className="public-page">
        <p className="eyebrow">ShulStack</p>
        <h1>{site.institutionName}</h1>
        {site.pages.length === 0 ? (
          <p className="muted">Nothing published yet.</p>
        ) : (
          <ul className="public-page-list">
            {site.pages.map((page) => (
              <li key={page.slug}>
                <Link href={`/sites/${slug}/${page.slug}`}>{page.title}</Link>
                {page.summary === undefined ? null : <p className="muted">{page.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </article>
    </main>
  );
}
