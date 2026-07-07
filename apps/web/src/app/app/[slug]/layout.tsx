"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@shulstack/convex/_generated/api";
import { Button, EmptyState } from "@shulstack/ui";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

  return (
    <div className="app-shell">
      <WorkspaceNav institutionName={workspace.institution.name} />
      <main className="app-main">{children}</main>
    </div>
  );
}

const NAV_ITEMS = [
  { segment: "", label: "Overview" },
  { segment: "households", label: "Households" },
  { segment: "people", label: "People" },
  { segment: "settings", label: "Settings" },
];

function WorkspaceNav({ institutionName }: { institutionName: string }) {
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
          {NAV_ITEMS.map((item) => {
            const href = item.segment === "" ? base : `${base}/${item.segment}`;
            const isActive = item.segment === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link className={isActive ? "nav-link active" : "nav-link"} href={href} key={href}>
                {item.label}
              </Link>
            );
          })}
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
