import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description === undefined ? null : <p className="muted">{description}</p>}
      {action}
    </div>
  );
}
