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

Payments, BankID and payout onboarding run in **test mode** (clearly marked in the UI).
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

- **Database:** Supabase project `parklet` in `eu-north-1` (Stockholm). Migrations are applied;
  RLS is enabled on every table with no policies, so Supabase's public Data API can't read
  anything, while the app connects as the table owner.
- **App:** Vercel, with functions pinned to `arn1` (Stockholm) in `vercel.json`.
- **Connection:** the Supabase ↔ Vercel integration injects `POSTGRES_URL` (transaction pooler,
  port 6543). The client strips pooler-specific URL parameters and disables prepared statements.
- **Vercel env:** `DOCUMENT_STORAGE=database`, `PAYMENT_PROVIDER=mock`, `NEXT_PUBLIC_DEMO=1`,
  `APP_URL=<production URL>`.
- **Mail:** no provider yet. Mails land in the `mail_outbox` table and are readable by admins
  at `/admin/epost`.
- **Demo accounts** were seeded with random passwords nobody holds (`SEED_PASSWORD=random`).
  An admin can take one over with "Glömt lösenord" and the outbox.
- **Future migrations:**
  `DATABASE_URL=<Supabase session pooler URL> npm run db:migrate`
  (the Drizzle journal on Supabase is up to date).

## Configuration

See [.env.example](.env.example). Production needs a real mail provider (the dev mailer
refuses to run in production unless `MAIL_OUTBOX` is set), a commercial map tile provider,
and the payment and e-ID integrations described in `docs/03-mvp.md`.
