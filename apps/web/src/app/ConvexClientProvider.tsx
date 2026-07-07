"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
const convex = new ConvexReactClient(convexUrl);

type ConvexClientProviderProps = {
  children: ReactNode;
};

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
