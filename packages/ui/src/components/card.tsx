import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Card({ title, actions, children }: CardProps) {
  return (
    <section className="card">
      {title === undefined && actions === undefined ? null : (
        <div className="card-header">
          {title === undefined ? <span /> : <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
