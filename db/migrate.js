import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import {
  closeDatabasePool,
  createPoolConfig,
  isDatabaseConfigured,
  sanitizeErrorMessage,
} from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(externalPool = null) {
  if (!externalPool && !isDatabaseConfigured()) {
    throw new Error(
      'PostgreSQL is not configured. Set DATABASE_URL (or PGHOST/PGUSER/PGDATABASE) in .env before running migrations.'
    );
  }

  const pool = externalPool ?? new Pool(createPoolConfig());
  const ownsPool = !externalPool;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(__dirname, 'migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const appliedRes = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.filename));
    const appliedNow = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      const hasTransactionControl = /\bBEGIN\s*;/i.test(sql) && /\bCOMMIT\s*;/i.test(sql);

      const client = await pool.connect();
      try {
        if (!hasTransactionControl) {
          await client.query('BEGIN');
        }
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        if (!hasTransactionControl) {
          await client.query('COMMIT');
        }
        appliedNow.push(file);
      } catch (err) {
        if (!hasTransactionControl) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Ignore rollback error
          }
        }
        throw err;
      } finally {
        client.release();
      }
    }

    return {
      totalFiles: files.length,
      appliedNow,
      alreadyAppliedCount: files.length - appliedNow.length,
    };
  } finally {
    if (ownsPool) {
      await pool.end();
      await closeDatabasePool();
    }
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  runMigrations()
    .then((summary) => {
      if (summary.appliedNow.length > 0) {
        console.log(`Applied migrations: ${summary.appliedNow.join(', ')}`);
      } else {
        console.log('All PostgreSQL migrations are already up to date.');
      }
    })
    .catch((err) => {
      console.error('Migration failed:', sanitizeErrorMessage(err));
      process.exit(1);
    });
}
