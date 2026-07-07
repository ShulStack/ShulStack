const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const COMBINING_MARKS = /[̀-ͯ]/g;

/** URL-safe identifier: lowercase alphanumerics and hyphens, 1-64 chars. */
export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** Best-effort conversion of a display name into a valid slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}
