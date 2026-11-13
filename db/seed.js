import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { hashPassword } from '../server/auth.js';
import {
  closeDatabasePool,
  createPoolConfig,
  isDatabaseConfigured,
  sanitizeErrorMessage,
  withTransaction,
} from '../server/db.js';
import { generateDemoSeedReadings, getLocalDateString } from '../src/utils/glucose.js';
import { runMigrations } from './migrate.js';

const DEMO_EMAIL = (process.env.SEED_DEMO_EMAIL || 'demo@sweety.app').trim().toLowerCase();
const DEMO_NAME = (process.env.SEED_DEMO_NAME || 'Maya Lin').trim();
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'DemoPass123!';

export async function seedDemoData(externalPool = null) {
  if (!externalPool && !isDatabaseConfigured()) {
    throw new Error(
      'PostgreSQL is not configured. Set DATABASE_URL (or PGHOST/PGUSER/PGDATABASE) in .env before running seed.'
    );
  }

  const pool = externalPool ?? new Pool(createPoolConfig());
  const ownsPool = !externalPool;

  try {
    await runMigrations(pool);

    const passwordHash = await hashPassword(DEMO_PASSWORD);

    const result = await withTransaction(async (client) => {
      const existingUserRes = await client.query(
        'SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [DEMO_EMAIL]
      );

      let user = existingUserRes.rows[0];
      let userCreated = false;

      if (!user) {
        const insertedUserRes = await client.query(
          `INSERT INTO users (name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, name, email`,
          [DEMO_NAME, DEMO_EMAIL, passwordHash]
        );
        user = insertedUserRes.rows[0];
        userCreated = true;
      }

      const dbDateRes = await client.query(
        "SELECT TO_CHAR(LEAST(CURRENT_DATE, $1::date), 'YYYY-MM-DD') AS ref_date",
        [getLocalDateString()]
      );
      const refDate = dbDateRes.rows[0]?.ref_date || getLocalDateString();
      const samples = generateDemoSeedReadings(String(user.id), refDate);
      let readingsInserted = 0;

      for (const sample of samples) {
        const insertReadingRes = await client.query(
          `INSERT INTO readings (user_id, reading_date, slot, value, note)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, reading_date, slot) DO NOTHING
           RETURNING id`,
          [
            user.id,
            sample.readingDate,
            sample.slot,
            sample.value,
            sample.slot === 'morning_fasting' ? 'Seeded sample reading' : null,
          ]
        );
        if ((insertReadingRes.rowCount ?? insertReadingRes.rows.length) > 0) {
          readingsInserted += 1;
        }
      }

      return {
        userCreated,
        email: user.email,
        userId: String(user.id),
        totalSampleReadings: samples.length,
        readingsInserted,
      };
    }, pool);

    return result;
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
  seedDemoData()
    .then((summary) => {
      console.log('Sweety demo seed complete:', {
        email: summary.email,
        userCreated: summary.userCreated,
        readingsInserted: summary.readingsInserted,
        totalSampleReadings: summary.totalSampleReadings,
      });
    })
    .catch((err) => {
      console.error('Seed failed:', sanitizeErrorMessage(err));
      process.exit(1);
    });
}
