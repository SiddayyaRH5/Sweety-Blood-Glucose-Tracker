import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { verifyPassword } from './auth.js';
import { checkDatabaseHealth, createPoolConfig, isDatabaseConfigured } from './db.js';
import { SweetyRepository } from './repositories/sweetyRepository.js';
import { runMigrations } from '../db/migrate.js';
import { getLocalDateString, getPreviousMonthBounds } from '../src/utils/glucose.js';

function getRealPgConfig() {
  const testUrl = (process.env.TEST_DATABASE_URL || '').trim();
  if (testUrl) {
    return createPoolConfig(testUrl);
  }
  if (isDatabaseConfigured()) {
    return createPoolConfig();
  }
  return null;
}

test('Real PostgreSQL end-to-end integration tests (20 checks)', async (t) => {
  const poolConfig = getRealPgConfig();

  if (!poolConfig) {
    const message =
      'Real PostgreSQL database is not configured (set TEST_DATABASE_URL or DATABASE_URL in .env to run live PostgreSQL integration tests).';
    if (process.env.REQUIRE_REAL_PG === '1') {
      assert.fail(message);
    }
    t.skip(message);
    return;
  }

  const pool = new Pool(poolConfig);
  const createdUserIds = [];

  t.after(async () => {
    try {
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
      }
    } finally {
      await pool.end();
    }
  });

  // 1. Database connection (real SQL version, database name, timestamp)
  const connRes = await pool.query(
    'SELECT version() AS version, current_database() AS database_name, NOW() AS server_time'
  );
  assert.ok(String(connRes.rows[0].version).toLowerCase().includes('postgresql'));
  assert.ok(String(connRes.rows[0].database_name).length > 0);
  assert.ok(connRes.rows[0].server_time instanceof Date);
  assert.equal(await checkDatabaseHealth(pool), 'connected');

  // 2. Migration execution & idempotency + verify tables, indexes, triggers exist
  await runMigrations(pool);
  const secondMigrationPass = await runMigrations(pool);
  assert.equal(secondMigrationPass.appliedNow.length, 0);

  const tablesRes = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [['users', 'readings', 'chat_messages', 'schema_migrations']]
  );
  assert.equal(tablesRes.rows.length, 4);

  const triggersRes = await pool.query(
    `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`,
    [['trg_users_updated_at', 'trg_readings_updated_at', 'trg_readings_max_four_per_day']]
  );
  assert.equal(triggersRes.rows.length, 3);

  const app = createApp({
    db: pool,
    checkDbHealth: () => checkDatabaseHealth(pool),
    enableRateLimit: false,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const api = async (path, opts = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  // Health endpoint accurately confirms real PostgreSQL connection
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.database, 'connected');
  assert.equal(health.data.connected, true);

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const emailA = `pgtest_a_${suffix}@example.com`;
  const emailB = `pgtest_b_${suffix}@example.com`;
  const password = 'PgStrongPassword123!';

  // 3. User registration
  const regA = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'PG Integration Alice', email: emailA, password },
  });
  assert.equal(regA.status, 201);
  const userA = regA.data.user;
  const tokenA = String(regA.data.token);
  createdUserIds.push(Number(userA.id));
  assert.equal('passwordHash' in userA, false);
  assert.equal('password_hash' in userA, false);

  // 4. Password hashing persisted in PostgreSQL
  const dbUserRes = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [
    userA.id,
  ]);
  assert.equal(dbUserRes.rows.length, 1);
  const storedHash = dbUserRes.rows[0].password_hash;
  assert.ok(storedHash.startsWith('$2'));
  assert.notEqual(storedHash, password);
  assert.equal(await verifyPassword(password, storedHash), true);

  // 5. Login and JWT authentication
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: emailA, password: 'WrongPassword123!' },
  });
  assert.equal(badLogin.status, 401);

  const loginA = await api('/api/auth/login', {
    method: 'POST',
    body: { email: emailA, password },
  });
  assert.equal(loginA.status, 200);
  assert.ok(loginA.data.token);

  // 6. Authenticated user profile
  const unauthMe = await api('/api/auth/me');
  assert.equal(unauthMe.status, 401);

  const meA = await api('/api/auth/me', { token: loginA.data.token });
  assert.equal(meA.status, 200);
  assert.equal(meA.data.user.email, emailA);

  // 7. Create glucose reading (all 4 slots on a safe UTC/local overlap date)
  const dbTodayRes = await pool.query(
    "SELECT TO_CHAR(LEAST(CURRENT_DATE, $1::date), 'YYYY-MM-DD') AS d",
    [getLocalDateString()]
  );
  const testDate = dbTodayRes.rows[0].d;

  const slots = ['morning_fasting', 'after_breakfast', 'after_lunch', 'after_dinner'];
  const values = [96, 138, 150, 128];
  const createdIds = [];

  for (let i = 0; i < slots.length; i += 1) {
    const created = await api('/api/readings', {
      method: 'POST',
      token: tokenA,
      body: {
        readingDate: testDate,
        slot: slots[i],
        value: values[i],
        note: `PG note ${i}`,
      },
    });
    assert.equal(created.status, 201);
    createdIds.push(created.data.reading.id);
  }

  // 8. List readings + pagination
  const listA = await api(`/api/readings?date=${testDate}`, { token: tokenA });
  assert.equal(listA.status, 200);
  assert.equal(listA.data.readings.length, 4);

  const pageA = await api(`/api/readings?date=${testDate}&page=1&limit=2`, { token: tokenA });
  assert.equal(pageA.status, 200);
  assert.equal(pageA.data.readings.length, 2);
  assert.equal(pageA.data.pagination.total, 4);
  assert.equal(pageA.data.pagination.totalPages, 2);

  // 9. Get reading by ID
  const getById = await api(`/api/readings/${createdIds[0]}`, { token: tokenA });
  assert.equal(getById.status, 200);
  assert.equal(getById.data.reading.value, 96);

  // 10. Update reading
  const updateRes = await api(`/api/readings/${createdIds[0]}`, {
    method: 'PUT',
    token: tokenA,
    body: { value: 104, note: 'Updated PG fasting' },
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.data.reading.value, 104);
  assert.equal(updateRes.data.reading.note, 'Updated PG fasting');

  // 12. Reject glucose below 40 or above 600 (API + direct PostgreSQL CHECK constraint)
  const invalidValueDate = testDate === '2000-01-01' ? '2000-01-02' : '2000-01-01';

  const tooLow = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: invalidValueDate, slot: 'morning_fasting', value: 39 },
  });
  assert.equal(tooLow.status, 400);

  const tooHigh = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: invalidValueDate, slot: 'morning_fasting', value: 601 },
  });
  assert.equal(tooHigh.status, 400);

  await assert.rejects(
    () =>
      pool.query(
        'INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)',
        [userA.id, invalidValueDate, 'morning_fasting', 605]
      ),
    (err) => err.code === '23514'
  );

  // 13. Reject decimal values
  const decimalRes = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: invalidValueDate, slot: 'morning_fasting', value: '115.4' },
  });
  assert.equal(decimalRes.status, 400);

  // 14. Reject future dates (API + direct PostgreSQL CHECK constraint)
  const futureDt = new Date();
  futureDt.setDate(futureDt.getDate() + 3);
  const futureDate = getLocalDateString(futureDt);

  const futureRes = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: futureDate, slot: 'morning_fasting', value: 105 },
  });
  assert.equal(futureRes.status, 400);

  await assert.rejects(
    () =>
      pool.query(
        "INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, (CURRENT_DATE + INTERVAL '3 days')::date, $2, $3)",
        [userA.id, 'morning_fasting', 105]
      ),
    (err) => err.code === '23514'
  );

  // 15. Reject duplicate slots (API + direct PostgreSQL UNIQUE constraint)
  const dupRes = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: testDate, slot: 'morning_fasting', value: 110 },
  });
  assert.equal(dupRes.status, 409);

  // Use a separate date so the max-four trigger does not mask the UNIQUE constraint.
  await pool.query(
    'INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)',
    [userA.id, invalidValueDate, 'morning_fasting', 110]
  );

  await assert.rejects(
    () =>
      pool.query(
        'INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)',
        [userA.id, invalidValueDate, 'morning_fasting', 110]
      ),
    (err) => err.code === '23505'
  );

  // 16. Enforce maximum four readings per day (API + trigger)
  const fifthRes = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: testDate, slot: 'after_dinner', value: 132 },
  });
  assert.ok(fifthRes.status === 400 || fifthRes.status === 409);

  // 17. Prevent User B from accessing/updating/deleting User A's readings
  const regB = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'PG Integration Bob', email: emailB, password },
  });
  assert.equal(regB.status, 201);
  createdUserIds.push(Number(regB.data.user.id));
  const tokenB = String(regB.data.token);

  assert.equal((await api('/api/readings', { token: tokenB })).data.readings.length, 0);
  assert.equal((await api(`/api/readings/${createdIds[0]}`, { token: tokenB })).status, 404);
  assert.equal(
    (
      await api(`/api/readings/${createdIds[0]}`, {
        method: 'PUT',
        token: tokenB,
        body: { value: 120 },
      })
    ).status,
    404
  );
  assert.equal(
    (
      await api(`/api/readings/${createdIds[0]}`, {
        method: 'DELETE',
        token: tokenB,
      })
    ).status,
    404
  );

  // 18. Daily report
  const dailyReport = await api(`/api/reports/daily?date=${testDate}`, { token: tokenA });
  assert.equal(dailyReport.status, 200);
  assert.equal(dailyReport.data.summary.totalCount, 4);
  assert.equal(dailyReport.data.summary.highest, 150);
  assert.equal(dailyReport.data.summary.lowest, 104);
  // (104 + 138 + 150 + 128) / 4 = 520 / 4 = 130.0
  assert.equal(dailyReport.data.summary.averageFormatted, '130.0');

  // 19. Month-to-date report & 20. Previous-month report
  const prevBounds = getPreviousMonthBounds(testDate);
  const prevCreated = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: prevBounds.startDate, slot: 'morning_fasting', value: 92 },
  });
  assert.equal(prevCreated.status, 201);

  const mtdReport = await api(`/api/reports/month-to-date?date=${testDate}`, { token: tokenA });
  assert.equal(mtdReport.status, 200);
  assert.equal(mtdReport.data.summary.totalCount, 4);

  const prevMonthReport = await api(`/api/reports/previous-month?date=${testDate}`, {
    token: tokenA,
  });
  assert.equal(prevMonthReport.status, 200);
  assert.equal(prevMonthReport.data.summary.totalCount, 1);
  assert.equal(prevMonthReport.data.summary.averageFormatted, '92.0');

  // Verify transaction rollback leaves zero orphaned rows on failure
  const repo = new SweetyRepository(pool);
  await assert.rejects(() =>
    repo.saveChatExchange({
      userId: userA.id,
      userContent: 'Valid first message that should roll back',
      assistantContent: '   ', // violates chat_messages content non-empty check
    })
  );
  const chatMsgsAfterRollback = await repo.listChatMessages(userA.id);
  assert.equal(chatMsgsAfterRollback.length, 0);

  // 11. Delete reading
  const deleteRes = await api(`/api/readings/${createdIds[3]}`, {
    method: 'DELETE',
    token: tokenA,
  });
  assert.equal(deleteRes.status, 200);
  const getDeleted = await api(`/api/readings/${createdIds[3]}`, { token: tokenA });
  assert.equal(getDeleted.status, 404);
});



