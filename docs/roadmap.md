# ShulStack Roadmap

This document records the current implementation plan for ShulStack so the project has a single reference point as build-out begins. It intentionally keeps the roadmap in one file for now, even though parts of it may later be split into smaller architecture documents.

## Summary

ShulStack should be built as a modular monolith with:

- one primary Next.js application
- one PostgreSQL database
- one background worker process
- one shared authentication layer
- one shared authorization model
- one shared Drizzle-owned product schema
- one CMS layer for content, media, forms, and site configuration

The initial stack decisions are:

- `Next.js App Router` for the public site, member portal, and staff dashboard
- `PostgreSQL` as the primary database
- `Drizzle` for product-owned schema, relations, and migrations
- `Better Auth` for authentication and session primitives
- `Graphile Worker` for background jobs, schedules, retries, and outbox consumption
- `Payload` for CMS, media, forms, SEO metadata, redirects, and content revisioning

The project is optimized for:

- single synagogue per deployment in v1
- single-node Docker deployment with local Docker Compose parity
- permissive-license-first dependencies
- structured section-based site editing rather than freeform page design

## Core Principles

- One canonical system of record for households, people, balances, permissions, and operational workflows.
- Modular capabilities without separate apps or separate databases per module.
- One deployable application boundary unless a second process is operationally necessary.
- Strong ownership boundaries between content data and business data.
- Self-hostable local development and production deployment without requiring hosted infrastructure.

## Architecture Decisions

### Application Shape

- `apps/web` will host the public site, member portal, staff UI, and mounted Payload admin.
- `apps/worker` will host scheduled jobs, webhook processing, exports, notifications, reminder flows, and domain-event consumers.
- `packages/db` will own shared Drizzle tables, relations, enums, and migrations for product-owned data.
- `packages/auth` will own Better Auth configuration, session helpers, and the user-to-person linkage.
- `packages/platform` will own module enablement, audit logging, notifications, file metadata, and outbox/event helpers.
- `packages/cms` will own Payload configuration, collections, globals, block definitions, and CMS-related types.

### Ownership Boundaries

- `Payload` owns CMS content, media, forms, redirects, SEO metadata, site settings, and content revisions.
- `Drizzle` owns CRM, finance, calendar, events, permissions, audit logs, domain events, and all other product-owned operational tables.
- `Better Auth` owns identity and session primitives, but authorization remains app-owned.
- `Graphile Worker` owns async execution and scheduled processing.
- `Postgres` owns search in MVP via full-text search and `pg_trgm`.

### Explicit Non-Choices

- No microservices in MVP.
- No Redis/BullMQ, Kafka, Temporal, or separate queue infrastructure in MVP.
- No external CRM, finance backend, or marketing automation platform as a system of record.
- No separate headless CMS beyond Payload.
- No freeform visual page builder in MVP.
- No GrapesJS-based HTML builder.
- No module data stored as CMS documents just to reuse the Payload admin UI.
- No OpenFGA or Postgres row-level security in MVP.

## Site Builder Plan

### Decision

Payload should be adopted as the site-builder foundation, but the editing model should be structured sections plus live preview rather than arbitrary drag-and-drop.

This means ShulStack will use:

- typed `Blocks` in Payload for page layouts
- approved React-rendered sections
- live preview against the real Next.js frontend
- site-wide settings through Payload `Globals`
- custom Payload admin components to improve editing ergonomics

This means ShulStack will not use:

- arbitrary HTML or CSS blobs as the canonical page representation
- visual free-placement editing in MVP
- a builder that bypasses the app design system or React components

### Why This Is the Right MVP Choice

- Synagogue websites need structured flexibility more than unconstrained design freedom.
- Content editors should be able to assemble pages without creating broken layouts.
- The frontend should remain typed, reusable, and component-driven.
- The same design system should power the site, member portal, and staff UI.
- A structured model keeps a future visual editor possible without changing the data ownership model.

### Page Layout Model

Pages should be modeled as ordered arrays of typed sections with schema-validated props. The page record should never become a blob of unstructured HTML.

Initial approved sections should include:

- `hero`
- `service-times`
- `featured-events`
- `staff-grid`
- `donation-cta`
- `calendar-preview`
- `announcements`
- `rich-text`
- `form-embed`
- `campaign-banner`

Each section should:

- have a typed schema in Payload
- render through a corresponding React component in Next.js
- support preview-safe defaults
- expose only the fields needed by editors

### Site Globals

Payload `Globals` should define site-wide settings for:

- organization branding
- logo and media references
- color and theme tokens
- typography tokens
- header and footer content
- primary navigation
- homepage defaults
- announcement bar content

### Editing Experience

Payload should be customized so editors are working with a guided site-builder experience rather than raw field arrays.

Improvements should include:

- clear block labels
- thumbnails or visual identifiers for each section type
- presets for common section configurations
- content guardrails and validation
- preview-first editing workflow

### Future Escape Hatch

If structured sections prove too restrictive, `Puck` is the preferred future upgrade path for homepage and landing-page editing. If that happens:

- Payload remains the storage and API layer
- Puck becomes an editor UI on top of Payload-managed data
- the React component system remains the rendering model

Puck is explicitly deferred from MVP.

## Data and Interface Boundaries

The following interfaces should be treated as first-class shared concepts from the start:

- `Institution`
- `ModuleEnablement`
- `AuthUser -> Person`
- `OutboxEvent`
- `PageLayout`
- `SiteGlobals`

### Institution

Even though v1 is single-org-per-deploy, the system should still define an institution object for:

- branding
- timezone and location
- enabled modules
- payment configuration
- email configuration
- synagogue-specific settings

### AuthUser to Person Linkage

Application users must link to CRM people through an explicit relationship, not by inferred email matching.

### Outbox Events

The web application and worker should share a stable domain-event envelope. Typical events include:

- `household.created`
- `household.updated`
- `membership.changed`
- `invoice.issued`
- `payment.completed`
- `payment.failed`
- `event.registration.created`
- `event.registration.cancelled`
- `donation.received`
- `seat.request.submitted`
- `seat.assignment.created`
- `student.enrolled`
- `yahrzeit.upcoming`
- `message.delivery.completed`

### Content vs Business Data

CMS content may reference business data, but it may not own it.

Examples:

- a homepage section may reference upcoming events
- a donation call-to-action may link to fundraising flows
- a calendar preview may render public events

But the authoritative records for those concepts remain in the calendar, events, finance, fundraising, and CRM domains.

## Auth, Authorization, and Tenancy

### Authentication

`Better Auth` should provide:

- email/password authentication
- session management
- password reset
- email verification
- future-ready support for MFA and passkeys
- future-ready support for impersonation and session revocation

### Authorization

Authorization should remain app-owned through explicit RBAC tables and permission checks.

The authorization model should include:

- roles
- permissions
- role-permission assignments
- user-role assignments
- module-scoped permission checks
- route-level and action-level enforcement

### Tenancy Posture

The product should be architected with tenant-shaped concepts, but v1 should not implement true multi-tenant SaaS behavior.

The v1 operating assumption is:

- one synagogue per deployment
- one organization context active in the app
- future multi-tenant expansion possible without schema rewrite

## Worker, Notifications, and Search

### Background Jobs

`Graphile Worker` should manage:

- scheduled reminders
- recurring billing jobs
- export and report generation
- webhook retries
- import processing
- domain-event side effects

### Email and Notifications

Notification delivery should use:

- `React Email` for email templates
- `Nodemailer` as the delivery abstraction
- `Mailpit` for local development

Provider interfaces should exist up front for:

- payments
- email delivery
- file storage
- imports

Only one concrete provider per interface is required in MVP.

### Search

Search should start inside PostgreSQL using:

- full-text search
- `pg_trgm`
- query patterns appropriate for people, households, content, and events

There should be no separate search service in MVP.

## Validation and Testing Plan

### Site Builder Validation

- Create, edit, preview, and publish a homepage from approved sections.
- Confirm editors can safely compose pages without arbitrary HTML injection.
- Confirm pages can reference real module data such as events, announcements, and donation CTAs.

### CMS Boundary Validation

- Confirm CMS users cannot mutate CRM or finance data through content tools.
- Confirm content revisions exist for page content.
- Confirm operational audit logs remain separate and app-owned.

### Local Stack Validation

- `docker compose up` should bring up `web`, `worker`, `postgres`, and `mailpit`.
- No hosted dependency should be required for local development.

### Core Workflow Validation

- Household onboarding should work independently of the CMS layer.
- Event registration and payment side effects should work independently of the CMS layer.
- Reminder emails and worker side effects should continue to function even though content is managed in Payload.

## Future Documentation Split

This roadmap is intentionally consolidated now. As the repository grows, it should be split into smaller docs under `docs/roadmap/`.

The planned split is:

- `docs/roadmap/01-architecture.md`
- `docs/roadmap/02-stack-decisions.md`
- `docs/roadmap/03-cms-and-site-builder.md`
- `docs/roadmap/04-auth-rbac-and-tenancy.md`
- `docs/roadmap/05-data-model-and-domain-events.md`
- `docs/roadmap/06-mvp-modules-and-route-map.md`
- `docs/roadmap/07-worker-notifications-and-integrations.md`
- `docs/roadmap/08-local-dev-and-deploy.md`

Each future document should include:

- the decision
- the rationale
- ownership boundaries
- deferred items
- the eventual package or file ownership

## Assumptions and Defaults

- The editing model is structured sections first, not freeform visual drag-and-drop.
- The deployment target is single-node Docker with local Docker Compose parity.
- The dependency posture is permissive-license-first.
- Payload remains the CMS/content platform, not the operational backend.
- Hosted infrastructure is optional, not required, for local development or baseline production deployment.

## References

- [Payload overview](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload custom admin components](https://payloadcms.com/docs/custom-components/overview)
- [Payload fields overview](https://payloadcms.com/docs/fields/overview)
- [Better Auth installation](https://www.better-auth.com/docs/installation)
- [Graphile Worker](https://worker.graphile.org/docs)
- [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch.html)
- [Puck overview](https://puckeditor.com/blog/how-to-build-a-react-page-builder-puck-and-tailwind-4)
- [GrapesJS documentation](https://grapesjs.com/docs/Home.html)
