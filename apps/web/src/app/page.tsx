import { MODULES } from "@shulstack/platform";
import { Card } from "@shulstack/ui";
import Link from "next/link";

const REPO_URL = "https://github.com/ShulStack/ShulStack";

const principles = [
  {
    title: "Own your data",
    body: "Your community's records live in your deployment, exportable at any time — not locked inside a vendor.",
  },
  {
    title: "One system of record",
    body: "Households, people, balances, content, and schedules share one backend and one authorization model. No sync jobs between silos.",
  },
  {
    title: "Self-hostable, truly",
    body: "One docker compose command brings up the full stack: the app, the Convex backend, its dashboard, and a local mail catcher.",
  },
];

export default function LandingPage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">ShulStack</p>
        <h1>The open-source operating system for synagogues.</h1>
        <p>
          A community-owned alternative to ShulCloud: membership CRM, billing, website, and the
          ritual-calendar workflows that generic tools never get right. Free, MIT-licensed, and
          built to be self-hosted.
        </p>
        <div className="hero-links">
          <Link className="button" href="/app">
            Open the dashboard
          </Link>
          <a className="button secondary" href={REPO_URL}>
            Star on GitHub
          </a>
        </div>
      </section>

      <section className="section-grid">
        {principles.map((item) => (
          <Card key={item.title} title={item.title}>
            <p className="muted">{item.body}</p>
          </Card>
        ))}
      </section>

      <section className="landing-section">
        <h2>Modular by design</h2>
        <p className="muted">
          Every congregation is different. Modules can be switched on per institution — start with
          the core and grow.
        </p>
        <div className="module-grid">
          {MODULES.map((module) => (
            <div className="module-tile" key={module.slug}>
              <h3>{module.label}</h3>
              <p className="muted">{module.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2>Honest about where we are</h2>
        <p className="muted">
          ShulStack is early. The platform core — multi-tenant institutions, staff roles with audit
          logging, the membership CRM, and household billing records — works today and is covered by
          an automated test suite. Most modules above are on the roadmap, not in the box. If that
          excites you rather than scares you, we would love your help.
        </p>
        <div className="hero-links">
          <a className="button secondary" href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}>
            Contributing guide
          </a>
          <a className="button secondary" href={`${REPO_URL}/blob/main/docs/architecture.md`}>
            Architecture
          </a>
        </div>
      </section>

      <footer className="landing-footer muted">MIT licensed. Built with Next.js and Convex.</footer>
    </main>
  );
}
