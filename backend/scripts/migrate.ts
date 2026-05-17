// ============================================================
// RISO HUB — scripts/migrate.ts
// Runs all pending migrations on deploy.
//
// Uses an idempotent QueryInterface wrapper so migrations are
// safe to re-run after partial failures:
//   - createTable  → uses IF NOT EXISTS
//   - addColumn    → skips if column already exists (PG 42701)
//   - addIndex     → skips if index already exists (PG 42P07/42710)
// ============================================================

import { Sequelize, QueryInterface } from 'sequelize';
import path from 'path';
import fs from 'fs';

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error('[Migrate] DATABASE_URL is required');
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  logging: false,
});

const MIGRATIONS_TABLE = 'sequelize_migrations';
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

interface Migration {
  up: (qi: QueryInterface) => Promise<void>;
  down: (qi: QueryInterface) => Promise<void>;
}

function pgCode(err: any): string | undefined {
  return err?.original?.code ?? err?.code;
}

// Wraps QueryInterface so DDL statements are idempotent.
// Partial failures from previous deploy attempts won't block retries.
function makeIdempotent(qi: QueryInterface): QueryInterface {
  return new Proxy(qi, {
    get(target: any, prop: string) {
      if (prop === 'createTable') {
        return (tableName: string, attributes: object, options?: object) =>
          target.createTable(tableName, attributes, { ...options, ifNotExists: true });
      }

      if (prop === 'addColumn') {
        return async (...args: any[]) => {
          try {
            return await target.addColumn(...args);
          } catch (err) {
            if (pgCode(err) === '42701') {
              console.log(`[Migrate]   ↳ column already exists, skipping`);
              return;
            }
            throw err;
          }
        };
      }

      if (prop === 'addIndex') {
        return async (...args: any[]) => {
          try {
            return await target.addIndex(...args);
          } catch (err) {
            const code = pgCode(err);
            if (code === '42P07' || code === '42710') {
              console.log(`[Migrate]   ↳ index already exists, skipping`);
              return;
            }
            throw err;
          }
        };
      }

      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function run() {
  const qi = makeIdempotent(sequelize.getQueryInterface());

  // Ensure migrations tracking table exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Get already-run migrations
  const [ran] = await sequelize.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  const ranNames = new Set((ran as any[]).map(r => r.name));

  // Read migration files — only compiled .js, sorted by filename
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  let applied = 0;

  for (const file of files) {
    if (ranNames.has(file)) {
      console.log(`[Migrate] ✓ Already run: ${file}`);
      continue;
    }

    console.log(`[Migrate] Running: ${file}…`);
    try {
      const migration: Migration = require(path.join(MIGRATIONS_DIR, file));
      await migration.up(qi);
      await sequelize.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (:name)`,
        { replacements: { name: file } }
      );
      console.log(`[Migrate] ✓ Applied: ${file}`);
      applied++;
    } catch (err) {
      console.error(`[Migrate] ✗ Failed: ${file}`, err);
      process.exit(1);
    }
  }

  if (applied === 0) {
    console.log('[Migrate] Nothing to migrate — database is up to date');
  } else {
    console.log(`[Migrate] Done — ${applied} migration(s) applied`);
  }

  await sequelize.close();
  process.exit(0);
}

run().catch(err => {
  console.error('[Migrate] Unexpected error:', err);
  process.exit(1);
});
