import { Pool } from 'pg';

export function sanitizeErrorMessage(err) {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown database error');
  return raw.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[redacted]@');
}

export function isDatabaseConfigured() {
  return Boolean(
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) ||
      (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)
  );
}

export function shouldUseDatabaseSsl(connectionString) {
  if (connectionString && /sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) {
    return true;
  }
  const sslSetting = (process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (sslSetting === 'false' || sslSetting === 'disable' || sslSetting === '0') {
    return false;
  }
  if (sslSetting === 'true' || sslSetting === 'require' || sslSetting === '1') {
    return true;
  }
  if (connectionString && /neon\.tech|render\.com/i.test(connectionString)) {
    return true;
  }
  return process.env.NODE_ENV === 'production';
}

export function createPoolConfig(connectionStringOverride) {
  const connectionString = (connectionStringOverride ?? process.env.DATABASE_URL ?? '').trim();
  const useSsl = shouldUseDatabaseSsl(connectionString);
  const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

  if (connectionString) {
    return {
      connectionString,
      ssl: sslConfig,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'sweety',
    ssl: sslConfig,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

export function getDatabasePool() {
  if (!isDatabaseConfigured()) {
    throw new Error(
      'PostgreSQL is not configured. Set DATABASE_URL (or PGHOST/PGUSER/PGDATABASE) in environment variables.'
    );
  }

  if (!globalThis._sweetyPgPool) {
    globalThis._sweetyPgPool = new Pool(createPoolConfig());
    globalThis._sweetyPgPool.on('error', (err) => {
      console.error('[Sweety PostgreSQL Pool Error]:', sanitizeErrorMessage(err));
    });
  }

  return globalThis._sweetyPgPool;
}

export const pgExecutor = {
  query(text, params = []) {
    return getDatabasePool().query(text, params);
  },
  connect() {
    return getDatabasePool().connect();
  },
};

export async function withTransaction(callback, pool = getDatabasePool()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure when connection is already broken
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(externalPool = null) {
  if (!externalPool && !isDatabaseConfigured()) {
    return 'not_configured';
  }
  try {
    const pool = externalPool ?? getDatabasePool();
    await pool.query('SELECT 1 AS ok');
    return 'connected';
  } catch {
    return 'error';
  }
}

export async function closeDatabasePool() {
  if (globalThis._sweetyPgPool) {
    const pool = globalThis._sweetyPgPool;
    globalThis._sweetyPgPool = undefined;
    await pool.end();
  }
}
