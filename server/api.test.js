import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { sanitizeErrorMessage, shouldUseDatabaseSsl } from './db.js';
import { getLocalDateString, getPreviousMonthBounds, VALID_SLOTS } from '../src/utils/glucose.js';

/**
 * In-memory PostgreSQL constraint-enforcing QueryExecutor for running
 * full HTTP Express integration tests without requiring a live Postgres daemon.
 * Mirrors schema constraints from db/migrations/001_initial_schema.sql.
 */
function createPostgresContractTestDb() {
  let nextUserId = 1;
  let nextReadingId = 1;
  let nextChatId = 1;
  const users = [];
  const readings = [];
  const chatMessages = [];

  const pgErr = (message, code) => {
    const err = new Error(message);
    err.code = code;
    return err;
  };

  return {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('INSERT INTO users')) {
        const [name, email, passwordHash] = params;
        if (!name || !name.trim()) throw pgErr('check_violation: name', '23514');
        if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          throw pgErr('duplicate key value violates unique constraint "users_email_key"', '23505');
        }
        const row = {
          id: nextUserId++,
          name,
          email,
          password_hash: passwordHash,
          created_at: new Date(),
        };
        users.push(row);
        return {
          rows: [{ id: String(row.id), name: row.name, email: row.email, created_at: row.created_at }],
          rowCount: 1,
        };
      }

      if (normalized.includes('FROM users WHERE LOWER(email) = LOWER($1)')) {
        const [email] = params;
        const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        return {
          rows: found
            ? [{ id: String(found.id), name: found.name, email: found.email, password_hash: found.password_hash, created_at: found.created_at }]
            : [],
          rowCount: found ? 1 : 0,
        };
      }

      if (normalized.includes('FROM users WHERE id = $1')) {
        const [id] = params;
        const found = users.find((u) => String(u.id) === String(id));
        return {
          rows: found
            ? [{ id: String(found.id), name: found.name, email: found.email, created_at: found.created_at }]
            : [],
          rowCount: found ? 1 : 0,
        };
      }

      if (normalized.startsWith('INSERT INTO readings')) {
        const [userId, readingDate, slot, value, note] = params;
        const uid = Number(userId);
        if (!users.some((u) => u.id === uid)) {
          throw pgErr('foreign key violation', '23503');
        }
        if (!VALID_SLOTS.has(slot)) {
          throw pgErr('invalid input value for enum reading_slot', '22P02');
        }
        if (!Number.isInteger(value) || value < 40 || value > 600) {
          throw pgErr('check violation: value', '23514');
        }
        if (readingDate > getLocalDateString()) {
          throw pgErr('check violation: reading_date <= CURRENT_DATE', '23514');
        }
        if (readings.some((r) => r.user_id === uid && r.reading_date === readingDate && r.slot === slot)) {
          throw pgErr('duplicate key value violates unique constraint "uq_user_date_slot"', '23505');
        }
        if (readings.filter((r) => r.user_id === uid && r.reading_date === readingDate).length >= 4) {
          throw pgErr('Maximum of 4 blood glucose readings per day exceeded', '23514');
        }
        const now = new Date();
        const row = {
          id: nextReadingId++,
          user_id: uid,
          reading_date: readingDate,
          slot,
          value,
          note,
          created_at: now,
          updated_at: now,
        };
        readings.push(row);
        return { rows: [{ ...row, id: String(row.id), user_id: String(row.user_id) }], rowCount: 1 };
      }

      if (normalized.startsWith('SELECT') && normalized.includes('FROM readings WHERE id = $1 AND user_id = $2')) {
        const [readingId, userId] = params;
        const found = readings.find(
          (r) => String(r.id) === String(readingId) && String(r.user_id) === String(userId)
        );
        return {
          rows: found ? [{ ...found, id: String(found.id), user_id: String(found.user_id) }] : [],
          rowCount: found ? 1 : 0,
        };
      }

      if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM readings WHERE user_id = $1')) {
        const userId = String(params[0]);
        let filtered = readings.filter((r) => String(r.user_id) === userId);
        const clauses = normalized.split('WHERE ')[1] ?? '';
        const parts = clauses.split(' AND ').slice(1);
        parts.forEach((clause, idx) => {
          const val = params[idx + 1];
          if (clause.includes('reading_date =')) filtered = filtered.filter((r) => r.reading_date === val);
          if (clause.includes('reading_date >=')) filtered = filtered.filter((r) => r.reading_date >= val);
          if (clause.includes('reading_date <=')) filtered = filtered.filter((r) => r.reading_date <= val);
          if (clause.includes('slot =')) filtered = filtered.filter((r) => r.slot === val);
        });
        return { rows: [{ total: filtered.length }], rowCount: 1 };
      }

      if (normalized.startsWith('SELECT') && normalized.includes('FROM readings WHERE user_id = $1')) {
        const userId = String(params[0]);
        let filtered = readings.filter((r) => String(r.user_id) === userId);
        const clauses = normalized.split('WHERE ')[1]?.split(' ORDER BY')[0] ?? '';
        const parts = clauses.split(' AND ').slice(1);
        let paramIdx = 1;
        parts.forEach((clause) => {
          const val = params[paramIdx++];
          if (clause.includes('reading_date =')) filtered = filtered.filter((r) => r.reading_date === val);
          if (clause.includes('reading_date >=')) filtered = filtered.filter((r) => r.reading_date >= val);
          if (clause.includes('reading_date <=')) filtered = filtered.filter((r) => r.reading_date <= val);
          if (clause.includes('slot =')) filtered = filtered.filter((r) => r.slot === val);
        });
        filtered.sort((a, b) => b.reading_date.localeCompare(a.reading_date));
        if (normalized.includes('LIMIT $')) {
          const limit = Number(params[paramIdx++]);
          const offset = normalized.includes('OFFSET $') ? Number(params[paramIdx++]) : 0;
          filtered = filtered.slice(offset, offset + limit);
        }
        return {
          rows: filtered.map((r) => ({ ...r, id: String(r.id), user_id: String(r.user_id) })),
          rowCount: filtered.length,
        };
      }

      if (normalized.startsWith('UPDATE readings')) {
        const [value, note, readingId, userId] = params;
        const target = readings.find(
          (r) => String(r.id) === String(readingId) && String(r.user_id) === String(userId)
        );
        if (!target) return { rows: [], rowCount: 0 };
        if (!Number.isInteger(value) || value < 40 || value > 600) {
          throw pgErr('check violation: value', '23514');
        }
        target.value = value;
        target.note = note;
        target.updated_at = new Date();
        return {
          rows: [{ ...target, id: String(target.id), user_id: String(target.user_id) }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith('DELETE FROM readings WHERE id = $1 AND user_id = $2')) {
        const [readingId, userId] = params;
        const idx = readings.findIndex(
          (r) => String(r.id) === String(readingId) && String(r.user_id) === String(userId)
        );
        if (idx === -1) return { rows: [], rowCount: 0 };
        const [removed] = readings.splice(idx, 1);
        return { rows: [{ id: String(removed.id) }], rowCount: 1 };
      }

      if (normalized.startsWith('INSERT INTO chat_messages')) {
        const [userId, role, content] = params;
        const row = {
          id: nextChatId++,
          user_id: Number(userId),
          role,
          content,
          created_at: new Date(),
        };
        chatMessages.push(row);
        return { rows: [{ ...row, id: String(row.id), user_id: String(row.user_id) }], rowCount: 1 };
      }

      if (normalized.startsWith('SELECT') && normalized.includes('FROM chat_messages WHERE user_id = $1')) {
        const [userId] = params;
        const list = chatMessages
          .filter((m) => String(m.user_id) === String(userId))
          .map((m) => ({ ...m, id: String(m.id), user_id: String(m.user_id) }));
        return { rows: list, rowCount: list.length };
      }

      if (normalized.startsWith('DELETE FROM chat_messages WHERE user_id = $1')) {
        const [userId] = params;
        for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
          if (String(chatMessages[i].user_id) === String(userId)) {
            chatMessages.splice(i, 1);
          }
        }
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unhandled SQL in test DB: ${normalized}`);
    },
  };
}

async function startTestServer() {
  const db = createPostgresContractTestDb();
  const app = createApp({
    db,
    checkDbHealth: async () => 'connected',
    enableRateLimit: false,
    aiInsightsFn: async (readings, label) => ({
      headline: `Stable trend across ${readings.length} readings`,
      summary: `Analysis for ${label}.`,
      patterns: ['Fasting values are consistent.'],
      recommendations: ['Keep logging daily.'],
      disclaimer: 'Consult your clinician for medical advice.',
    }),
    aiChatFn: async (message, _history, readings) =>
      `Mock assistant reply to "${message}" (${readings.length} readings in context).`,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, baseUrl };
}

test('Sweety backend API integration tests (Auth, CRUD, Validation, Isolation, Reports, AI)', async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => new Promise((resolve) => server.close(() => resolve())));

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

  // 1. Health check
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.database, 'connected');
  assert.equal(health.data.connected, true);

  // 2. Auth: unauthenticated request rejected
  const unauthReadings = await api('/api/readings');
  assert.equal(unauthReadings.status, 401);

  // 3. Auth: register User A, ensure password_hash never exposed, reject duplicate email & weak password
  const weakPwd = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Alice', email: 'alice@example.com', password: '123' },
  });
  assert.equal(weakPwd.status, 400);

  const regA = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Alice Patel', email: 'Alice@Example.com', password: 'Password123!' },
  });
  assert.equal(regA.status, 201);
  const tokenA = String(regA.data.token);
  const userA = regA.data.user;
  assert.equal(userA.email, 'alice@example.com');
  assert.equal('passwordHash' in userA, false);
  assert.equal('password_hash' in userA, false);

  const dupReg = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Alice Duplicate', email: 'alice@example.com', password: 'Password123!' },
  });
  assert.equal(dupReg.status, 409);

  // 4. Auth: login & /api/auth/me
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.com', password: 'WrongPassword1!' },
  });
  assert.equal(badLogin.status, 401);

  const loginA = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.com', password: 'Password123!' },
  });
  assert.equal(loginA.status, 200);
  assert.ok(loginA.data.token);

  const meA = await api('/api/auth/me', { token: tokenA });
  assert.equal(meA.status, 200);
  assert.equal(meA.data.user.email, 'alice@example.com');

  const logoutRes = await api('/api/auth/logout', { method: 'POST', token: tokenA });
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.data.loggedOut, true);

  // 5. Validation checks on POST /api/readings
  const today = getLocalDateString();
  const futureDt = new Date();
  futureDt.setDate(futureDt.getDate() + 2);
  const futureDate = getLocalDateString(futureDt);

  const badInputs = [
    { readingDate: today, slot: 'morning_fasting', value: 39 }, // below 40
    { readingDate: today, slot: 'morning_fasting', value: 601 }, // above 600
    { readingDate: today, slot: 'morning_fasting', value: '112.5' }, // decimal
    { readingDate: today, slot: 'morning_fasting', value: {} }, // non-string object
    { readingDate: futureDate, slot: 'morning_fasting', value: 110 }, // future date
    { readingDate: today, slot: 'midnight_snack', value: 110 }, // invalid slot
  ];
  for (const payload of badInputs) {
    const res = await api('/api/readings', { method: 'POST', token: tokenA, body: payload });
    assert.equal(res.status, 400);
  }

  // Malformed JSON returns 400
  const badJsonRes = await fetch(`${baseUrl}/api/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: '{"value":',
  });
  assert.equal(badJsonRes.status, 400);

  // 6. CRUD + Duplicate slot + Max 4 per day
  const slots = [
    'morning_fasting',
    'after_breakfast',
    'after_lunch',
    'after_dinner',
  ];
  const values = [95, 140, 152, 131];
  const createdIds = [];

  for (let i = 0; i < slots.length; i += 1) {
    const created = await api('/api/readings', {
      method: 'POST',
      token: tokenA,
      body: { readingDate: today, slot: slots[i], value: values[i], note: `Note ${i}` },
    });
    assert.equal(created.status, 201);
    createdIds.push(created.data.reading.id);
  }

  // Duplicate slot & 5th reading on same day rejected
  const dupSlot = await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: today, slot: 'morning_fasting', value: 100 },
  });
  assert.equal(dupSlot.status, 409);

  // Update reading
  const updated = await api(`/api/readings/${createdIds[0]}`, {
    method: 'PUT',
    token: tokenA,
    body: { value: 101, note: 'Updated fasting' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.reading.value, 101);

  // 7. User Isolation: register User B and verify User B cannot see, update, or delete User A's readings
  const regB = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Bob Chen', email: 'bob@example.com', password: 'Password123!' },
  });
  assert.equal(regB.status, 201);
  const tokenB = String(regB.data.token);

  const listB = await api('/api/readings', { token: tokenB });
  assert.equal(listB.status, 200);
  assert.equal(listB.data.readings.length, 0);

  // Pagination on GET /api/readings (?page=1&limit=2)
  const page1 = await api('/api/readings?page=1&limit=2', { token: tokenA });
  assert.equal(page1.status, 200);
  assert.equal(page1.data.readings.length, 2);
  assert.equal(page1.data.pagination.total, 4);
  assert.equal(page1.data.pagination.totalPages, 2);
  const badPage = await api('/api/readings?page=0&limit=20', { token: tokenA });
  assert.equal(badPage.status, 400);

  // Fetch single reading by ID (owned vs invalid ID vs cross-user)
  const getOneA = await api(`/api/readings/${createdIds[0]}`, { token: tokenA });
  assert.equal(getOneA.status, 200);
  assert.equal(getOneA.data.reading.id, createdIds[0]);

  const invalidIdGet = await api('/api/readings/not-an-id', { token: tokenA });
  assert.equal(invalidIdGet.status, 400);

  const crossGet = await api(`/api/readings/${createdIds[0]}`, { token: tokenB });
  assert.equal(crossGet.status, 404);

  const crossUpdate = await api(`/api/readings/${createdIds[0]}`, {
    method: 'PUT',
    token: tokenB,
    body: { value: 120 },
  });
  assert.equal(crossUpdate.status, 404);

  const crossDelete = await api(`/api/readings/${createdIds[0]}`, {
    method: 'DELETE',
    token: tokenB,
  });
  assert.equal(crossDelete.status, 404);

  // Clearing note with null on update works
  const clearedNote = await api(`/api/readings/${createdIds[0]}`, {
    method: 'PUT',
    token: tokenA,
    body: { value: 101, note: null },
  });
  assert.equal(clearedNote.status, 200);
  assert.equal(clearedNote.data.reading.note, undefined);

  // 8. Report endpoints (Daily, Month-to-Date, Previous-Month, Empty report)
  const dailyReport = await api(`/api/reports/daily?date=${today}`, { token: tokenA });
  assert.equal(dailyReport.status, 200);
  const dailySummary = dailyReport.data.summary;
  assert.equal(dailySummary.totalCount, 4);
  assert.equal(dailySummary.highest, 152);
  assert.equal(dailySummary.lowest, 101);
  // (101 + 140 + 152 + 131) / 4 = 524 / 4 = 131.0
  assert.equal(dailySummary.averageFormatted, '131.0');

  const prevBounds = getPreviousMonthBounds(today);
  await api('/api/readings', {
    method: 'POST',
    token: tokenA,
    body: { readingDate: prevBounds.startDate, slot: 'morning_fasting', value: 98 },
  });

  const mtdReport = await api(`/api/reports/month-to-date?date=${today}`, { token: tokenA });
  assert.equal(mtdReport.status, 200);
  assert.equal(mtdReport.data.summary.totalCount, 4);

  const prevMonthReport = await api(`/api/reports/previous-month?date=${today}`, { token: tokenA });
  assert.equal(prevMonthReport.status, 200);
  assert.equal(prevMonthReport.data.summary.totalCount, 1);

  // Empty report for User B
  const emptyReportB = await api(`/api/reports/daily?date=${today}`, { token: tokenB });
  assert.equal(emptyReportB.status, 200);
  assert.equal(emptyReportB.data.summary.totalCount, 0);
  assert.equal(emptyReportB.data.summary.averageFormatted, '—');

  // 9. Delete reading and confirm count drops
  const deleted = await api(`/api/readings/${createdIds[3]}`, {
    method: 'DELETE',
    token: tokenA,
  });
  assert.equal(deleted.status, 200);
  const dailyAfterDelete = await api(`/api/reports/daily?date=${today}`, { token: tokenA });
  assert.equal(dailyAfterDelete.data.summary.totalCount, 3);

  // 10. Care Assistant chat persistence & user isolation
  const chatPost = await api('/api/ai/chat', {
    method: 'POST',
    token: tokenA,
    body: { message: 'How are my fasting readings?' },
  });
  assert.equal(chatPost.status, 201);
  assert.ok(String(chatPost.data.reply).includes('4 readings in context'));

  const chatListA = await api('/api/ai/chat', { token: tokenA });
  assert.equal(chatListA.data.messages.length, 2);

  const chatListB = await api('/api/ai/chat', { token: tokenB });
  assert.equal(chatListB.data.messages.length, 0);

  const clearA = await api('/api/ai/chat', { method: 'DELETE', token: tokenA });
  assert.equal(clearA.status, 200);
  const chatAfterClearA = await api('/api/ai/chat', { token: tokenA });
  assert.equal(chatAfterClearA.data.messages.length, 0);
});

test('Health endpoint reports 503 and connected:false when PostgreSQL is unavailable or unconfigured', async (t) => {
  for (const [dbState, expectedStatus] of [
    ['not_configured', 'unconfigured'],
    ['error', 'degraded'],
  ]) {
    const app = createApp({
      db: {
        async query() {
          throw new Error('Should not query');
        },
      },
      checkDbHealth: async () => dbState,
      enableRateLimit: false,
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
    const body = await res.json();
    await new Promise((resolve) => server.close(() => resolve()));

    assert.equal(res.status, 503);
    assert.equal(body.connected, false);
    assert.equal(body.database, dbState);
    assert.equal(body.status, expectedStatus);
  }
});

test('Database helpers sanitize connection strings in error logs and detect Neon SSL properly', () => {
  const err = new Error('Connection failed for postgresql://alice:supersecret@ep-demo.neon.tech/sweety');
  const sanitized = sanitizeErrorMessage(err);
  assert.equal(sanitized.includes('supersecret'), false);
  assert.ok(sanitized.includes('postgresql://[redacted]@ep-demo.neon.tech/sweety'));

  const prevSsl = process.env.DATABASE_SSL;
  delete process.env.DATABASE_SSL;
  try {
    assert.equal(
      shouldUseDatabaseSsl('postgresql://user:pass@ep-demo.us-east-2.aws.neon.tech/sweety?sslmode=require'),
      true
    );
    assert.equal(shouldUseDatabaseSsl('postgresql://postgres:postgres@localhost:5432/sweety'), false);
  } finally {
    if (prevSsl !== undefined) process.env.DATABASE_SSL = prevSsl;
  }
});
