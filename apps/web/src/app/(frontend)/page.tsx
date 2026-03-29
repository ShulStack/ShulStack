import { MODULES } from "@shulstack/platform";
import { StackCard } from "@shulstack/ui";
import Link from "next/link";

const workspaceAreas = [
  {
    title: "Public site and CMS",
    body: "Structured page sections, Payload globals, media, forms, redirects, and SEO metadata.",
  },
  {
    title: "Platform foundation",
    body: "Institution settings, module enablement, audit logging, provider interfaces, and an outbox-driven worker boundary.",
  },
  {
    title: "Operational modules",
    body: "CRM, finance, calendar, events, communications, and synagogue-specific workflows will sit on the shared schema.",
  },
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">ShulStack</p>
        <h1>Modular synagogue software with one shared system of record.</h1>
        <p>
          The workspace is scaffolded with Next.js, Payload, Better Auth, Drizzle, and Graphile
          Worker so implementation can start from a real monorepo instead of a blank repository.
        </p>
        <div className="hero-links">
          <Link className="button" href="/admin">
            Open Payload Admin
          </Link>
          <Link className="button secondary" href="https://mailpit.axllent.org/">
            Mailpit Docs
          </Link>
          <Link className="button secondary" href="/api/auth/session">
            Auth Route Stub
          </Link>
        </div>
      </section>

      <section className="section-grid">
        {workspaceAreas.map((item) => (
          <StackCard key={item.title} title={item.title}>
            <p className="muted">{item.body}</p>
          </StackCard>
        ))}
      </section>

      <section className="section-grid">
        <StackCard title="Enabled module registry">
          <ul>
            {MODULES.map((module) => (
              <li key={module.slug}>
                <strong>{module.label}</strong>: <span className="muted">{module.slug}</span>
              </li>
            ))}
          </ul>
        </StackCard>

        <StackCard title="Bootstrap commands">
          <ul>
            <li>
              <code>./bin/task bootstrap</code>
            </li>
            <li>
              <code>./bin/task dev</code>
            </li>
            <li>
              <code>./bin/task do</code>
            </li>
          </ul>
        </StackCard>
      </section>
    </main>
  );
}
