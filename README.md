# Julius

A small self-hosted app to track a family's net worth and recurring costs. Everything is entered by hand, and amounts are in CHF.

- **Net worth:** bank, investment and pension accounts (2nd pillar / BVG, Pillar 3a, vested benefits).
  - Pension money is shown separately as *locked until retirement*.
  - An account belongs to one person or is shared. Shared accounts are split evenly between their owners.
  - You can view the current value and the history over time, per person and for the whole family.
- **Reminders:** accounts without a new balance for more than 31 days are flagged. The threshold can be changed in Settings.
- **Recurring costs:** fixed costs (rent, child care, utilities, taxes) and subscriptions (insurances, streaming, newspapers, apps).
  - Each cost has an amount and a billing cycle, plus either a fixed contract term with a renewal date, or "ongoing" with just a notice period (Kündigungsfrist), as for rent.
  - The **All costs** tab shows monthly and yearly totals, the split by kind, by person and by category.
  - The **Subscriptions** tab shows renewals and the last day to cancel, and flags deadlines within 30 days.
  - The Overview only shows the monthly and yearly totals.

## Run with Docker

```sh
docker compose up -d --build
```

Open http://localhost:3000. The data lives in the `julius-data` volume (`/app/data/julius.db`).

To try the app with an example household, set `SEED_DEMO: "true"` in `docker-compose.yml` before the first start. This only fills an empty database. Remove the volume to start over:

```sh
docker compose down -v
```

There is no login. Run Julius on your LAN, or put it behind a reverse proxy or VPN that handles access.

## Backups

Settings → **Download backup (JSON)** exports everything: persons, accounts, balance history and recurring costs. **Restore from backup…** replaces all data with a backup file. Backups from older versions (with "subscriptions" instead of "costs") still restore. Settings also offers a CSV export of all balances.

The API works for automated backups too:

```sh
curl -o julius-$(date +%F).json http://localhost:3000/api/backup
```

## Development

Requires Node.js 22+.

```sh
npm install
npm run dev        # client on :3000 (Vite), API on :3001
npm test           # unit tests for the net worth and subscription calculations
npm run typecheck
npm run seed       # load demo data into ./data/julius.db (add -- --force to replace existing data)
```

After changing `src/server/db/schema.ts`, run `npm run db:generate` to create a migration in `drizzle/`. Migrations run automatically on startup.

## Structure

```
src/shared/   types, CHF/date helpers, calculations (net worth, staleness, recurring costs, renewals) + tests
src/server/   Hono API, SQLite via Drizzle, validation (zod), demo data
src/client/   React app (pages: Overview, Update balances, Accounts, Recurring costs, Settings)
drizzle/      SQL migrations
```

All amounts are stored as integer Rappen. Values are calculated in `src/shared/calc.ts`:

- An account's value on a date is its most recent balance on or before that date.
- A closed account counts as 0 from its closing date on.
