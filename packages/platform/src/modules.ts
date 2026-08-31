/**
 * The single registry of ShulStack modules. The Convex schema, backend
 * functions, and every UI surface derive module identity from this list.
 */
export const MODULES = [
  {
    slug: "crm",
    available: true,
    label: "CRM",
    description: "Households, people, relationships, and the canonical member records.",
  },
  {
    slug: "finance",
    available: true,
    label: "Finance",
    description: "Billing profiles, balances, statements, and payment tracking.",
  },
  {
    slug: "calendar",
    available: false,
    label: "Calendar",
    description: "Services, classes, and community events on one schedule.",
  },
  {
    slug: "cms",
    available: true,
    label: "Website",
    description: "The public website: pages, navigation, and site settings.",
  },
  {
    slug: "member-portal",
    available: false,
    label: "Member Portal",
    description: "Self-service access for members: profile, balances, and registrations.",
  },
  {
    slug: "events",
    available: false,
    label: "Events",
    description: "Event registration, ticketing, and attendance.",
  },
  {
    slug: "communications",
    available: false,
    label: "Communications",
    description: "Email and announcement delivery to members and groups.",
  },
  {
    slug: "fundraising",
    available: true,
    label: "Fundraising",
    description: "Campaigns, pledges, and donation tracking.",
  },
  {
    slug: "yahrzeits",
    available: false,
    label: "Yahrzeits",
    description: "Yahrzeit tracking with Hebrew-calendar observance dates and reminders.",
  },
  {
    slug: "seating",
    available: false,
    label: "Seating",
    description: "High Holiday seating requests and assignments.",
  },
  {
    slug: "school",
    available: false,
    label: "School",
    description: "Religious school enrollment, classes, and tuition.",
  },
  {
    slug: "ritual",
    available: false,
    label: "Ritual",
    description: "Honors, aliyot, leyning schedules, and minyan coordination.",
  },
  {
    slug: "cemetery",
    available: false,
    label: "Cemetery",
    description: "Plot records, ownership, and interment tracking.",
  },
  {
    slug: "reporting",
    available: false,
    label: "Reporting",
    description: "Cross-module reports and exports.",
  },
] as const;

export type Module = (typeof MODULES)[number];
export type ModuleSlug = Module["slug"];

export const MODULE_SLUGS = MODULES.map((module) => module.slug) as ModuleSlug[];

/** Modules switched on for a newly created institution: everything that has
 * actually shipped. Unavailable modules stay off until they land. */
export const DEFAULT_ENABLED_MODULES: readonly ModuleSlug[] = MODULES.filter(
  (module) => module.available,
).map((module) => module.slug);

export function isModuleSlug(value: string): value is ModuleSlug {
  return (MODULE_SLUGS as string[]).includes(value);
}
