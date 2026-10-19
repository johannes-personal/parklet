# Recommended tech stack

The existing site's problems are not caused by its framework (it already runs Next.js).
They come from missing domain modelling, no tests, and no compliance design. The stack below
is chosen to make the hard parts of a parking marketplace correct by construction and cheap
to run for a small team.

## At a glance

| Concern | Choice | Why |
|---|---|---|
| Web app | **Next.js 16 (App Router) + TypeScript + React 19** | One codebase for marketing pages, search, booking and admin. Server Components and Server Actions keep secrets and business rules on the server. Good SEO for city and listing pages |
| Styling | **Tailwind CSS 4** | Fast to iterate, consistent design tokens, no runtime CSS |
| Database | **PostgreSQL 16** (managed: **Supabase** or **Neon**, EU region) | Transactions, constraints and range types. `btree_gist` exclusion constraints make double bookings impossible at the database level (see below) |
| Geo search | Postgres + bounding-box index (MVP) → **PostGIS** at scale | The MVP runs on plain Postgres; PostGIS (`ST_DWithin`, GiST) is a drop-in upgrade, available on Supabase and Neon |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Typed SQL with no magic, plain SQL migrations, supports custom SQL (exclusion constraints) |
| Validation | **Zod** | One schema shared by forms and server |
| Auth | Email + password (MVP), then **BankID / Freja eID** via **Criipto** or **Signicat** (OIDC); passkeys later | Swedes expect BankID. A broker gives verified name and personnummer for host verification and DAC7, and removes passwords for most users |
| Payments | **Stripe Connect** (Express accounts, destination charges); alternatives Adyen for Platforms or Mangopay | Licensed partner holds the funds, so Parklet needs no payment institution licence. Handles KYC/AML on hosts, SCA/3-D Secure, cards, Apple/Google Pay, Klarna and Swish, refunds and payouts. See `03-mvp.md` |
| Maps | **MapLibre GL** + **OpenFreeMap** vector tiles (MapTiler or Stadia if an SLA is needed) | No vendor lock-in, no key, commercial use allowed; one dark style for the interactive maps and the background. OSM's public tiles are not allowed for production traffic |
| Geocoding | **Photon** (self-hosted, OSM) or **Mapbox Search** / **Lantmäteriet** | Swedish addresses, server-side proxy for caching and rate limiting |
| Document storage | **S3-compatible bucket in the EU** (Supabase Storage, Cloudflare R2 EU jurisdiction, or Scaleway), private, encrypted, with lifecycle rules | Ownership proofs and rental contracts are sensitive personal data |
| Email | **Postmark** or **Resend** | Transactional deliverability, templates, bounce handling |
| Hosting | **Vercel** (region `arn1` Stockholm / `fra1`), or **Fly.io** / **Scaleway** in Stockholm or Paris | Keep compute next to the database and inside the EU |
| Observability | **Sentry** (errors, EU data region) + **OpenTelemetry**; Vercel or Axiom logs | Catch the class of bug found in the review (silent 422s, half-rendered maps) |
| Testing | **Vitest** (unit + integration against real Postgres), **Playwright** (end-to-end, desktop + mobile) | The MVP ships with both, and they run in CI |
| CI/CD | **GitHub Actions** (lint, typecheck, unit, integration, build, e2e) + preview deployments | Every change verified before it reaches users |
| Analytics | **Plausible** or **PostHog EU** | Cookie-less or EU-hosted, simple consent story |

## Key design decisions

### Correctness lives in the database
A booking marketplace's worst failure is two drivers holding the same spot. The MVP
enforces this with a Postgres exclusion constraint:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (spot_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('pending_payment', 'confirmed'));
```

The application also checks availability first (for good error messages), but concurrent
requests cannot race past the constraint. The integration test fires five simultaneous
bookings and asserts exactly one wins.

### Money in integers, time in UTC, display in Stockholm
- Prices are stored as integer öre, never floats.
- Timestamps are `timestamptz` (UTC). Availability rules are Stockholm wall-clock windows,
  evaluated day by day so bookings across midnight and DST changes are handled. Both DST
  changes are covered by tests.

### One app, Swedish first
A single Next.js app serves marketing, search, booking, hosting and admin under one domain.
That removes the dead-link and split-brand problems found in the review. The UI is Swedish
(`lang="sv"`). Strings are centralised enough to add English with `next-intl` later.

### Pluggable providers behind small interfaces
Payments (`src/server/payments.ts`), e-ID (`src/server/identity.ts`), email
(`src/server/mailer.ts`), geocoding (`src/server/geocode.ts`) and document storage
(`src/server/storage.ts`) are each one small module. The MVP ships mocks or development
implementations, so the full product can be exercised end to end without credentials.
Production implementations replace one file each.

## What I would avoid
- **No-code / low-code for the core** (the first version was built in Lovable, per press
  coverage). Fine for validating demand, but a marketplace with payments, verification and
  legal reporting needs code you can test.
- **A separate CMS site for marketing** (Framer today). It splits navigation, SEO and brand.
  If editors need a CMS, use a headless one (Sanity, Payload) rendered by the same app.
- **A US region** for a Swedish service.
- **Holding drivers' money in your own bank account** before paying hosts. In Sweden that is
  a payment service needing Finansinspektionen authorisation (see `03-mvp.md`).

## Running cost at launch (rough)
Vercel Pro ~$20/month, Supabase Pro ~$25/month, MapTiler ~$25–50/month, Postmark ~$15/month,
Sentry free tier, Criipto from roughly €100/month plus per-login fees. Stripe charges per
transaction (cards ~1.5% + 1.80 SEK for European cards; Connect payouts extra). In total
**about 2,000–3,000 SEK per month** before transaction fees. These are estimates, so check
current price lists.
