/**
 * The single registry of ShulStack modules. The Convex schema, backend
 * functions, and every UI surface derive module identity from this list.
 */
export const MODULES = [
  {
    slug: "crm",
    label: "CRM",
    description: "Households, people, relationships, and the canonical member records.",
  },
  {
    slug: "finance",
    label: "Finance",
    description: "Billing profiles, balances, statements, and payment tracking.",
  },
  {
    slug: "calendar",
    label: "Calendar",
    description: "Services, classes, and community events on one schedule.",
  },
  {
    slug: "cms",
    label: "Website",
    description: "The public website: pages, navigation, and site settings.",
  },
  {
    slug: "member-portal",
    label: "Member Portal",
    description: "Self-service access for members: profile, balances, and registrations.",
  },
  {
    slug: "events",
    label: "Events",
    description: "Event registration, ticketing, and attendance.",
  },
  {
    slug: "communications",
    label: "Communications",
    description: "Email and announcement delivery to members and groups.",
  },
  {
    slug: "fundraising",
    label: "Fundraising",
    description: "Campaigns, pledges, and donation tracking.",
  },
  {
    slug: "yahrzeits",
    label: "Yahrzeits",
    description: "Yahrzeit tracking with Hebrew-calendar observance dates and reminders.",
  },
  {
    slug: "seating",
    label: "Seating",
    description: "High Holiday seating requests and assignments.",
  },
  {
    slug: "school",
    label: "School",
    description: "Religious school enrollment, classes, and tuition.",
  },
  {
    slug: "ritual",
    label: "Ritual",
    description: "Honors, aliyot, leyning schedules, and minyan coordination.",
  },
  {
    slug: "cemetery",
    label: "Cemetery",
    description: "Plot records, ownership, and interment tracking.",
  },
  {
    slug: "reporting",
    label: "Reporting",
    description: "Cross-module reports and exports.",
  },
] as const;

export type Module = (typeof MODULES)[number];
export type ModuleSlug = Module["slug"];

export const MODULE_SLUGS = MODULES.map((module) => module.slug) as ModuleSlug[];

/** Modules switched on for a newly created institution. */
export const DEFAULT_ENABLED_MODULES: readonly ModuleSlug[] = [
  "crm",
  "finance",
  "cms",
  "member-portal",
  "fundraising",
];

export function isModuleSlug(value: string): value is ModuleSlug {
  return (MODULE_SLUGS as string[]).includes(value);
}
