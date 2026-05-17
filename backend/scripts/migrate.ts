// ============================================================
// RISO HUB — scripts/migrate.ts
// Runs all pending migrations on deploy.
// Each migration is wrapped in a transaction so a partial failure
// rolls back completely — no more half-applied migrations.
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

async function run() {
  const qi = sequelize.getQueryInterface();

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

    // Wrap in a raw transaction so any partial failure is fully rolled back.
    // Postgres DDL (CREATE TABLE, ALTER TABLE, etc.) IS transactional.
    await sequelize.query('BEGIN');
    try {
      const migration: Migration = require(path.join(MIGRATIONS_DIR, file));
      await migration.up(qi);
      await sequelize.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (:name)`,
        { replacements: { name: file } }
      );
      await sequelize.query('COMMIT');
      console.log(`[Migrate] ✓ Applied: ${file}`);
      applied++;
    } catch (err) {
      await sequelize.query('ROLLBACK').catch(() => {});
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
