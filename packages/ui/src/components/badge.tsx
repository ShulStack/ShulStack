import type { ReactNode } from "react";

type BadgeProps = {
  tone?: "neutral" | "positive" | "negative" | "warning";
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
