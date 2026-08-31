"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@shulstack/convex/_generated/api";
import { Button, EmptyState } from "@shulstack/ui";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { SignInForm } from "../../../components/sign-in-form";
import { useWorkspace } from "../../../components/use-workspace";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <main className="shell narrow">
          <p className="muted">Checking session…</p>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <main className="shell narrow">
          <SignInForm />
        </main>
      </Unauthenticated>
      <Authenticated>
        <WorkspaceShell>{children}</WorkspaceShell>
      </Authenticated>
    </>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();

  if (workspace === undefined) {
    return (
      <main className="shell narrow">
        <p className="muted">Loading workspace…</p>
      </main>
    );
  }
  if (workspace === null) {
    return (
      <main className="shell narrow">
        <EmptyState
          action={
            <Link className="button secondary" href="/app">
              Back to your institutions
            </Link>
          }
          description="Either it doesn't exist, or you haven't been added as staff."
          title="You don't have access to this institution"
        />
      </main>
    );
  }

  const cmsEnabled = workspace.modules.some((module) => module.slug === "cms" && module.enabled);
  const isAdmin = workspace.role === "admin" || workspace.role === "owner";
  const navItems: NavEntry[] = [
    { segment: "", label: "Overview" },
    { segment: "households", label: "Households" },
    { segment: "people", label: "People" },
    ...(cmsEnabled ? [{ segment: "website", label: "Website" }] : []),
    ...(isAdmin ? [{ segment: "import", label: "Import" }] : []),
    ...(isAdmin
      ? [
          {
            label: "Developer",
            children: [
              { segment: "developer/api-keys", label: "API keys" },
              { segment: "developer/mcp", label: "MCP" },
              { segment: "developer/docs", label: "Docs" },
            ],
          },
        ]
      : []),
    { segment: "settings", label: "Settings" },
  ];
  return (
    <div className="app-shell">
      <WorkspaceNav institutionName={workspace.institution.name} navItems={navItems} />
      <main className="app-main">{children}</main>
    </div>
  );
}

type NavLeaf = { segment: string; label: string };
type NavEntry = NavLeaf | { label: string; children: NavLeaf[] };

function NavItemLink({
  base,
  item,
  pathname,
  sub = false,
}: {
  base: string;
  item: NavLeaf;
  pathname: string;
  sub?: boolean;
}) {
  const href = item.segment === "" ? base : `${base}/${item.segment}`;
  const isActive = item.segment === "" ? pathname === base : pathname.startsWith(href);
  const className = `${isActive ? "nav-link active" : "nav-link"}${sub ? " nav-sublink" : ""}`;
  return (
    <Link aria-current={isActive ? "page" : undefined} className={className} href={href}>
      {item.label}
    </Link>
  );
}

/** A collapsible nav section (e.g. Developer), open while you're inside it. */
function NavGroup({
  base,
  group,
  pathname,
}: {
  base: string;
  group: NavGroupEntry;
  pathname: string;
}) {
  const containsCurrent = group.children.some((child) =>
    pathname.startsWith(`${base}/${child.segment}`),
  );
  const [expanded, setExpanded] = useState(containsCurrent);
  return (
    <div className="nav-group">
      <button
        aria-expanded={expanded || containsCurrent}
        className="nav-link nav-group-toggle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {group.label}
        <span aria-hidden="true">{expanded || containsCurrent ? "▾" : "▸"}</span>
      </button>
      {expanded || containsCurrent
        ? group.children.map((child) => (
            <NavItemLink base={base} item={child} key={child.segment} pathname={pathname} sub />
          ))
        : null}
    </div>
  );
}

type NavGroupEntry = { label: string; children: NavLeaf[] };

function WorkspaceNav({
  institutionName,
  navItems,
}: {
  institutionName: string;
  navItems: NavEntry[];
}) {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.current);
  const base = `/app/${params.slug}`;

  return (
    <aside className="app-nav">
      <div className="app-nav-top">
        <Link className="app-nav-brand" href="/app">
          <span className="eyebrow">ShulStack</span>
        </Link>
        <p className="app-nav-institution">{institutionName}</p>
        <nav>
          {navItems.map((item) =>
            "children" in item ? (
              <NavGroup base={base} group={item} key={item.label} pathname={pathname} />
            ) : (
              <NavItemLink base={base} item={item} key={item.segment} pathname={pathname} />
            ),
          )}
        </nav>
      </div>
      <div className="app-nav-bottom">
        <p className="muted app-nav-user">{viewer?.email}</p>
        <Button onClick={() => void signOut()} variant="secondary">
          Sign out
        </Button>
      </div>
    </aside>
  );
}
