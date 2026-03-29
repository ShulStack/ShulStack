import type { CollectionConfig } from "payload";

export const cmsUsers: CollectionConfig = {
  slug: "cms-users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  fields: [
    {
      name: "displayName",
      type: "text",
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "Owner", value: "owner" },
        { label: "Editor", value: "editor" },
        { label: "Publisher", value: "publisher" },
      ],
      defaultValue: "editor",
      required: true,
    },
  ],
};
