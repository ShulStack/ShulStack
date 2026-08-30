"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (convexUrl === undefined) {
  // Fail at build/startup rather than shipping a frontend wired to nothing.
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Locally, run `task dev` (it loads .env); " +
      "on Vercel it is set automatically by scripts/vercel-build.mjs.",
  );
}
const convex = new ConvexReactClient(convexUrl);

type ConvexClientProviderProps = {
  children: ReactNode;
};

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
