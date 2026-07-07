"use client";

import { api } from "@shulstack/convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

/**
 * The current institution workspace, derived from the [slug] route segment.
 * Convex deduplicates the underlying subscription across components.
 * `undefined` while loading; `null` when the viewer has no access.
 */
export function useWorkspace() {
  const params = useParams<{ slug: string }>();
  return useQuery(api.platform.getWorkspace, { slug: params.slug });
}

export function useCanAdminister(): boolean {
  const workspace = useWorkspace();
  return workspace?.role === "admin" || workspace?.role === "owner";
}
