import { ConvexError } from "convex/values";

/** User-facing message from a mutation/query failure. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatTimestamp(epochMillis: number): string {
  return dateTimeFormat.format(new Date(epochMillis));
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** Format an ISO calendar date ("2026-07-01") without timezone shifting. */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return isoDate;
  }
  return dateFormat.format(new Date(year, month - 1, day));
}

/** Today's date in the ISO calendar-date shape used across the schema. */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
