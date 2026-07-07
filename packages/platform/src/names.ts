export type PersonNameParts = {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  mailName?: string | null;
};

/**
 * The one canonical way a person is rendered in lists and search. Stored
 * denormalized on the person document and recomputed on every write.
 */
export function buildPersonDisplayName(parts: PersonNameParts): string {
  const given = clean(parts.nickname) ?? clean(parts.firstName);
  const family = clean(parts.lastName);
  const assembled = [given, family].filter((part) => part !== undefined).join(" ");
  return assembled !== "" ? assembled : (clean(parts.mailName) ?? "Unnamed person");
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
