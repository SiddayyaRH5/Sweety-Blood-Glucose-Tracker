import 'dotenv/config';
import {
  closeDatabasePool,
  getDatabasePool,
  isDatabaseConfigured,
  sanitizeErrorMessage,
} from './db.js';

async function verifyConnection() {
  if (!isDatabaseConfigured()) {
    console.error(
      'PostgreSQL is not configured. Missing DATABASE_URL (and PGHOST/PGUSER/PGDATABASE).'
    );
    process.exitCode = 1;
    return;
  }

  try {
    const pool = getDatabasePool();
    const versionRes = await pool.query('SELECT version() AS version');
    const dbRes = await pool.query('SELECT current_database() AS database_name');
    const nowRes = await pool.query('SELECT NOW() AS server_time');

    console.log('PostgreSQL connected:', {
      database: dbRes.rows[0]?.database_name,
      version: String(versionRes.rows[0]?.version || '').split(',')[0],
      serverTime: nowRes.rows[0]?.server_time,
    });
  } catch (err) {
    console.error('PostgreSQL connection check failed:', sanitizeErrorMessage(err));
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

void verifyConnection();
