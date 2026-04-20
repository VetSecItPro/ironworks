# @ironworksai/db

Database schema, migrations, and typed query helpers for IronWorks.

## Stack

- **Driver:** Postgres (production) / embedded-postgres (local dev) / PGlite (in-memory tests)
- **ORM:** drizzle-orm with drizzle-kit migrations
- **Schema-as-code:** every table, column, and index is declared in `src/schema/*.ts`

## Layout

```
packages/db/
├── src/
│   ├── schema/            Per-domain schema modules (companies, agents, issues, ...)
│   ├── index.ts           Re-exports table + type aliases
│   └── connection.ts      Db client construction helpers
├── drizzle/               Generated migrations (drizzle-kit)
└── drizzle.config.ts      Migration config
```

## Migrations

Generate after changing any `src/schema/*.ts`:

```sh
cd packages/db
pnpm drizzle-kit generate
```

Apply locally:

```sh
pnpm drizzle-kit push
```

In production the server runs pending migrations on boot if `IRONWORKS_MIGRATION_AUTO_APPLY=true`, or reports required migrations if `IRONWORKS_MIGRATION_PROMPT=never`.

## Consuming from other packages

```ts
import { companies, users, type Company } from "@ironworksai/db";
import { db } from "./connection.js"; // your app-level db instance

const rows = await db.select().from(companies).where(eq(companies.id, companyId));
```

## Testing

Schema validity is verified via `pnpm -r typecheck`. Integration tests live in `server/` and use the `helpers/embedded-postgres.ts` lifecycle helper to spin up isolated Postgres instances per test run.

## License

MIT
