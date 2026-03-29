// src/index.ts
var DEFAULT_DATABASE_URL = "postgres://shulstack:shulstack@127.0.0.1:5432/shulstack";
var MODULES = [
  { slug: "crm", label: "CRM Core" },
  { slug: "finance", label: "Finance Core" },
  { slug: "calendar", label: "Calendar Core" },
  { slug: "cms", label: "CMS" },
  { slug: "member-portal", label: "Member Portal" },
  { slug: "events", label: "Events" },
  { slug: "communications", label: "Communications" },
  { slug: "fundraising", label: "Fundraising" },
  { slug: "yahrzeits", label: "Yahrzeits" },
  { slug: "seating", label: "Seating" },
  { slug: "school", label: "School" },
  { slug: "ritual", label: "Ritual" },
  { slug: "cemetery", label: "Cemetery" },
  { slug: "reporting", label: "Reporting" }
];
var PROVIDERS = {
  email: "local-smtp",
  payments: "stripe",
  storage: "local-disk",
  imports: "csv"
};
export {
  DEFAULT_DATABASE_URL,
  MODULES,
  PROVIDERS
};
