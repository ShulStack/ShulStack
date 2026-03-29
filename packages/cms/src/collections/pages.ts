import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { CollectionConfig } from "payload";

import { pageLayoutBlocks } from "../blocks/page-layout";

export const pages: CollectionConfig = {
  slug: "pages",
  admin: {
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    livePreview: {
      url: ({ data }) => {
        const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
        const slug = typeof data?.slug === "string" && data.slug.length > 0 ? data.slug : "";
        return slug === "home" || slug === "" ? origin : `${origin}/${slug}`;
      },
    },
    useAsTitle: "title",
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: {
      autosave: {
        interval: 300,
      },
    },
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Use `home` for the homepage.",
      },
    },
    {
      name: "summary",
      type: "textarea",
    },
    {
      name: "layout",
      type: "blocks",
      required: true,
      blocks: pageLayoutBlocks,
    },
    {
      name: "seoTitle",
      type: "text",
    },
    {
      name: "seoDescription",
      type: "textarea",
    },
    {
      name: "bodyFallback",
      type: "richText",
      editor: lexicalEditor(),
    },
  ],
};
