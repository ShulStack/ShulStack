"use client";

import { Button } from "@shulstack/ui";

/** Root error boundary: shown when a route throws during render. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell narrow">
      <article className="public-page">
        <p className="eyebrow">ShulStack</p>
        <h1>Something went wrong</h1>
        <p className="muted">{error.message}</p>
        <p>
          <Button onClick={() => reset()} variant="secondary">
            Try again
          </Button>
        </p>
      </article>
    </main>
  );
}
