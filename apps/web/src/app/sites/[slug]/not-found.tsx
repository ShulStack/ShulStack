import Link from "next/link";

/** Shown for unknown site slugs and unpublished/missing pages. */
export default function SiteNotFound() {
  return (
    <main className="shell narrow">
      <article className="public-page">
        <p className="eyebrow">ShulStack</p>
        <h1>Page not found</h1>
        <p className="muted">
          This page doesn&apos;t exist or hasn&apos;t been published. If you followed a link from
          the congregation&apos;s site, try its home page.
        </p>
        <p>
          <Link className="button secondary" href="/">
            Back to ShulStack
          </Link>
        </p>
      </article>
    </main>
  );
}
