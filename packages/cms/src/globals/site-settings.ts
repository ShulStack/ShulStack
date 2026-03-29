import type { GlobalConfig } from "payload";

export const siteSettings: GlobalConfig = {
  slug: "site-settings",
  fields: [
    {
      name: "siteName",
      type: "text",
      required: true,
      defaultValue: "ShulStack",
    },
    {
      name: "tagline",
      type: "text",
      defaultValue: "Open-source synagogue operating system",
    },
    {
      name: "primaryNavigation",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "href", type: "text", required: true },
      ],
    },
    {
      name: "announcementBar",
      type: "group",
      fields: [
        { name: "enabled", type: "checkbox", defaultValue: false },
        { name: "message", type: "text" },
        { name: "href", type: "text" },
      ],
    },
    {
      name: "theme",
      type: "group",
      fields: [
        { name: "primary", type: "text", defaultValue: "#3f6b57" },
        { name: "accent", type: "text", defaultValue: "#8c5d2e" },
        { name: "background", type: "text", defaultValue: "#f7f3ea" },
      ],
    },
  ],
};
