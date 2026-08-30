import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell narrow">
      <article className="public-page">
        <p className="eyebrow">ShulStack</p>
        <h1>Page not found</h1>
        <p className="muted">There&apos;s nothing at this address.</p>
        <p>
          <Link className="button secondary" href="/">
            Back to the home page
          </Link>
        </p>
      </article>
    </main>
  );
}
