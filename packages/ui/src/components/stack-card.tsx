import type { ReactNode } from "react";

type StackCardProps = {
  children: ReactNode;
  title: string;
};

export function StackCard({ children, title }: StackCardProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
