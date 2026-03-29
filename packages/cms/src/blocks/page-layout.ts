import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { Block } from "payload";

export const pageLayoutBlocks: Block[] = [
  {
    slug: "hero",
    interfaceName: "HeroSection",
    fields: [
      { name: "eyebrow", type: "text" },
      { name: "title", type: "text", required: true },
      { name: "description", type: "textarea" },
      { name: "primaryLinkLabel", type: "text" },
      { name: "primaryLinkHref", type: "text" },
    ],
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
          { name: "notes", type: "text" },
        ],
      },
    ],
  },
  {
    slug: "featured-events",
    interfaceName: "FeaturedEventsSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Featured Events" },
      { name: "limit", type: "number", required: true, defaultValue: 3 },
      { name: "eventCategory", type: "text" },
    ],
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
          { name: "bio", type: "textarea" },
        ],
      },
    ],
  },
  {
    slug: "donation-cta",
    interfaceName: "DonationCallToActionSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Support the shul" },
      { name: "description", type: "textarea" },
      { name: "buttonLabel", type: "text", required: true, defaultValue: "Donate" },
      { name: "buttonHref", type: "text", required: true, defaultValue: "/donate" },
    ],
  },
  {
    slug: "calendar-preview",
    interfaceName: "CalendarPreviewSection",
    fields: [
      { name: "title", type: "text", required: true, defaultValue: "Upcoming" },
      { name: "limit", type: "number", required: true, defaultValue: 5 },
      { name: "calendarSlug", type: "text" },
    ],
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
          { name: "body", type: "richText", editor: lexicalEditor() },
        ],
      },
    ],
  },
  {
    slug: "rich-text",
    interfaceName: "RichTextSection",
    fields: [
      { name: "title", type: "text" },
      { name: "content", type: "richText", editor: lexicalEditor(), required: true },
    ],
  },
  {
    slug: "form-embed",
    interfaceName: "FormEmbedSection",
    fields: [
      { name: "title", type: "text" },
      { name: "formSlug", type: "text", required: true },
      { name: "submitLabel", type: "text", defaultValue: "Submit" },
    ],
  },
  {
    slug: "campaign-banner",
    interfaceName: "CampaignBannerSection",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "textarea" },
      { name: "buttonLabel", type: "text" },
      { name: "buttonHref", type: "text" },
    ],
  },
];
