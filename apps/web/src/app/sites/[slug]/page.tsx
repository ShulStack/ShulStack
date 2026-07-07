import { api } from "@shulstack/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type SiteIndexProps = {
  params: Promise<{ slug: string }>;
};

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
