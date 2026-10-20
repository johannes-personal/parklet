# Parklet

A rebuild of [parklet.se](https://www.parklet.se), a marketplace where people and
organisations rent out their parking spots when they're not using them.

- **[docs/01-site-review.md](docs/01-site-review.md)**: review of the current site
  (16 findings with evidence, prioritised).
- **[docs/02-tech-stack.md](docs/02-tech-stack.md)**: recommended stack and why.
- **[docs/03-mvp.md](docs/03-mvp.md)**: what the MVP does, how it handles right-to-rent
  verification, compliant payments and BRF vehicle registration, and what's next.

![MVP home page](docs/images/mvp-home.png)

## Quick start

Requirements: Node.js 22+ and PostgreSQL 14+ with the `btree_gist` extension (it ships with
`postgresql-contrib` and the official Docker image).

```bash
docker compose up -d db          # or use your own Postgres
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed                  # demo data; prints the demo accounts
npm run dev                      # http://localhost:3000
```

Demo accounts (password `parklet-demo-1`):

| Email | Role |
|---|---|
| `forare@parklet.test` | Driver with upcoming bookings |
| `anna@parklet.test` | Private host |
| `styrelsen@parklet.test` | Brf Linnéstaden (requires vehicle registration) |
| `erik@parklet.test` | Private host and administrator of a property company |
| `ny@parklet.test` | New host who hasn't verified or connected payouts |
| `admin@parklet.test` | Parklet reviewer (`/admin`) |

Payments and payout onboarding run in **test mode** (clearly marked in the UI). BankID uses
Idura when configured (see Deployment) and an instant mock otherwise.
Emails are printed to the server log and appended to `storage/outbox.jsonl`, so you can
follow approval, invitation and reset links locally.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm test` | Unit + integration tests (needs `parklet_test` database; set `TEST_DATABASE_URL` to override) |
| `npm run test:e2e` | Playwright against a production build (`npm run build` first; uses `parklet_e2e` database) |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` | Apply migrations / load demo data |

## Deployment (Vercel + Supabase, Stockholm)

Live demo: **https://parklet-rebuild.vercel.app**

- **Database:** Supabase project `parklet` in `eu-north-1` (Stockholm). Migrations are applied;
  RLS is enabled on every table with no policies, so Supabase's public Data API can't read
  anything, while the app connects as the table owner.
- **App:** Vercel, with functions pinned to `arn1` (Stockholm) in `vercel.json`.
- **Connection:** the Supabase ↔ Vercel integration injects `POSTGRES_URL` (Supavisor's
  transaction pooler, port 6543). The client strips pooler-specific URL parameters and disables
  prepared statements (`src/db/client-options.ts`). Session mode (port 5432) is not an option on
  Vercel: it allows only 15 clients in total.
- **Vercel env:** `DOCUMENT_STORAGE=database`, `NEXT_PUBLIC_DEMO=1`. Links use `APP_URL` if
  set, otherwise Vercel's production or deployment URL.
- **Mail:** every mail lands in the `mail_outbox` table, readable by admins at `/admin/epost`.
  With `RESEND_API_KEY` and `MAIL_FROM` set, mail to real addresses is also sent through
  [Resend](https://resend.com); the demo accounts' `@parklet.test` addresses are never sent.
- **Demo accounts** on production use the password `parklet-demo-1` (they were seeded with
  random ones, `SEED_PASSWORD=random`, and reset for testing). An admin can also take one over
  with "Glömt lösenord" and the outbox.
- **BankID (Idura):** set `IDURA_ISSUER` (`https://<your-domain>.idura.broker`),
  `IDURA_CLIENT_ID`, `IDURA_CLIENT_SECRET` and `IDENTITY_ENCRYPTION_KEY` in Vercel. In Idura,
  the application is a *Regular Web Application* with *OAuth2 Code Flow* enabled and the redirect
  URL `https://parklet-rebuild.vercel.app/konto/verifiera/callback`. Without these variables
  the demo keeps the instant mock. The e2e tests run the real flow against `e2e/fake-idp.mjs`.
- **Bolagsverket (free company register API):** set `BOLAGSVERKET_CLIENT_ID` and
  `BOLAGSVERKET_CLIENT_SECRET` (plus `BOLAGSVERKET_ENV=test` for their test environment). New
  association and company accounts are then checked against the register: unknown and
  deregistered numbers are refused, the registered name is used, and admins see the result.
  Without credentials the check is skipped. The e2e tests use `e2e/fake-bolagsverket.mjs`.
- **Stuck queries:** the app treats a query that takes more than 20 s (a transaction: 30 s) as
  stuck and replaces its connection pool (`src/db/index.ts`). As a second net, pg_cron job
  `parklet-end-stuck-queries` ends app queries stuck for over 2 minutes every 5 minutes and tells
  admins in the bell (`scripts/supabase-stuck-queries.sql`, applied by hand on Supabase).
- **Reminders:** Supabase's pg_cron calls `/api/cron/paminnelser` every 10 minutes (job
  `parklet-reminders`, via pg_net). It authenticates with the `cron` row in `app_secrets`, a
  token generated inside the database, so there is no secret to copy into Vercel.
- **Maps:** MapLibre with OpenFreeMap's vector tiles, recoloured by `src/lib/map-style.ts`.
  MapLibre itself is served from `public/maplibre/` (copied on `npm install`).
- **Future migrations:**
  `DATABASE_URL=<Supabase session pooler URL> npm run db:migrate`
  (the Drizzle journal on Supabase is up to date).

## Configuration

See [.env.example](.env.example). Before a real launch, production needs Resend set up with
a verified sending domain, and the payment
and e-ID integrations described in `docs/03-mvp.md`.
