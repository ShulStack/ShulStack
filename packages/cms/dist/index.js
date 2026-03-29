// src/collections/cms-users.ts
var cmsUsers = {
  slug: "cms-users",
  admin: {
    useAsTitle: "email"
  },
  auth: true,
  fields: [
    {
      name: "displayName",
      type: "text"
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "Owner", value: "owner" },
        { label: "Editor", value: "editor" },
        { label: "Publisher", value: "publisher" }
      ],
      defaultValue: "editor",
      required: true
    }
  ]
};

// src/collections/media.ts
var media = {
  slug: "media",
  admin: {
    useAsTitle: "alt"
  },
  access: {
    read: () => true
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true
    },
    {
      name: "caption",
      type: "textarea"
    }
  ],
  upload: {
    staticDir: "media",
    adminThumbnail: "thumbnail",
    imageSizes: [
      {
        name: "thumbnail",
        width: 480,
        height: 320,
        fit: "cover"
      }
    ],
    mimeTypes: ["image/*"]
  }
};

// src/collections/pages.ts
import { lexicalEditor as lexicalEditor2 } from "@payloadcms/richtext-lexical";

// src/blocks/page-layout.ts
import { lexicalEditor } from "@payloadcms/richtext-lexical";
var pageLayoutBlocks = [
  {
    slug: "hero",
    interfaceName: "HeroSection",
    fields: [
      { name: "eyebrow", type: "text" },
      { name: "title", type: "text", required: true },
      { name: "description", type: "textarea" },
      { name: "primaryLinkLabel", type: "text" },
      { name: "primaryLinkHref", type: "text" }
    ]
  },
  {
    slug: "service-times",
    interfaceName: "ServiceTimesSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Service Times" },
      {
        name: "items",
        type: "array",
        fields: [
          { name: "label", type: "text", required: true },
          { name: "time", type: "text", required: true },
          { name: "notes", type: "text" }
        ]
      }
    ]
  },
  {
    slug: "featured-events",
    interfaceName: "FeaturedEventsSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Featured Events" },
      { name: "limit", type: "number", required: true, defaultValue: 3 },
      { name: "eventCategory", type: "text" }
    ]
  },
  {
    slug: "staff-grid",
    interfaceName: "StaffGridSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Meet the Team" },
      {
        name: "people",
        type: "array",
        fields: [
          { name: "name", type: "text", required: true },
          { name: "role", type: "text" },
          { name: "bio", type: "textarea" }
        ]
      }
    ]
  },
  {
    slug: "donation-cta",
    interfaceName: "DonationCallToActionSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Support the shul" },
      { name: "description", type: "textarea" },
      { name: "buttonLabel", type: "text", required: true, defaultValue: "Donate" },
      { name: "buttonHref", type: "text", required: true, defaultValue: "/donate" }
    ]
  },
  {
    slug: "calendar-preview",
    interfaceName: "CalendarPreviewSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Upcoming" },
      { name: "limit", type: "number", required: true, defaultValue: 5 },
      { name: "calendarSlug", type: "text" }
    ]
  },
  {
    slug: "announcements",
    interfaceName: "AnnouncementsSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Announcements" },
      {
        name: "items",
        type: "array",
        fields: [
          { name: "title", type: "text", required: true },
          { name: "body", type: "richText", editor: lexicalEditor() }
        ]
      }
    ]
  },
  {
    slug: "rich-text",
    interfaceName: "RichTextSection",
    fields: [
      { name: "title", type: "text" },
      { name: "content", type: "richText", editor: lexicalEditor(), required: true }
    ]
  },
  {
    slug: "form-embed",
    interfaceName: "FormEmbedSection",
    fields: [
      { name: "title", type: "text" },
      { name: "formSlug", type: "text", required: true },
      { name: "submitLabel", type: "text", defaultValue: "Submit" }
    ]
  },
  {
    slug: "campaign-banner",
    interfaceName: "CampaignBannerSection",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "textarea" },
      { name: "buttonLabel", type: "text" },
      { name: "buttonHref", type: "text" }
    ]
  }
];

// src/collections/pages.ts
var pages = {
  slug: "pages",
  admin: {
    defaultColumns: ["title", "slug", "_status", "updatedAt"],
    livePreview: {
      url: ({ data }) => {
        const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
        const slug = typeof data?.slug === "string" && data.slug.length > 0 ? data.slug : "";
        return slug === "home" || slug === "" ? origin : `${origin}/${slug}`;
      }
    },
    useAsTitle: "title"
  },
  access: {
    read: () => true
  },
  versions: {
    drafts: {
      autosave: {
        interval: 300
      }
    }
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Use `home` for the homepage."
      }
    },
    {
      name: "summary",
      type: "textarea"
    },
    {
      name: "layout",
      type: "blocks",
      required: true,
      blocks: pageLayoutBlocks
    },
    {
      name: "seoTitle",
      type: "text"
    },
    {
      name: "seoDescription",
      type: "textarea"
    },
    {
      name: "bodyFallback",
      type: "richText",
      editor: lexicalEditor2()
    }
  ]
};

// src/globals/site-settings.ts
var siteSettings = {
  slug: "site-settings",
  fields: [
    {
      name: "siteName",
      type: "text",
      required: true,
      defaultValue: "ShulStack"
    },
    {
      name: "tagline",
      type: "text",
      defaultValue: "Open-source synagogue operating system"
    },
    {
      name: "primaryNavigation",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "href", type: "text", required: true }
      ]
    },
    {
      name: "announcementBar",
      type: "group",
      fields: [
        { name: "enabled", type: "checkbox", defaultValue: false },
        { name: "message", type: "text" },
        { name: "href", type: "text" }
      ]
    },
    {
      name: "theme",
      type: "group",
      fields: [
        { name: "primary", type: "text", defaultValue: "#3f6b57" },
        { name: "accent", type: "text", defaultValue: "#8c5d2e" },
        { name: "background", type: "text", defaultValue: "#f7f3ea" }
      ]
    }
  ]
};

// src/index.ts
var cmsCollections = [cmsUsers, media, pages];
var cmsGlobals = [siteSettings];
export {
  cmsCollections,
  cmsGlobals,
  pageLayoutBlocks
};
