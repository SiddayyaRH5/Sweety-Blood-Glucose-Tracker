function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function mapReadingRow(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    readingDate: String(row.reading_date).slice(0, 10),
    slot: row.slot,
    value: Number(row.value),
    note: row.note && row.note.length > 0 ? row.note : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export class SweetyRepository {
  constructor(db) {
    this.db = db;
  }

  async createUser({ name, email, passwordHash }) {
    const result = await this.db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );
    const row = result.rows[0];
    return {
      id: String(row.id),
      name: row.name,
      email: row.email,
      createdAt: toIsoString(row.created_at),
    };
  }

  async findUserByEmail(email) {
    const result = await this.db.query(
      `SELECT id, name, email, password_hash, created_at
         FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [email]
    );
    const row = result.rows[0];
    if (!row || !row.password_hash) return null;
    return {
      id: String(row.id),
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: toIsoString(row.created_at),
    };
  }

  async findUserPublicById(userId) {
    const result = await this.db.query(
      `SELECT id, name, email, created_at
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      name: row.name,
      email: row.email,
      createdAt: toIsoString(row.created_at),
    };
  }

  async listReadingsByUser(userId, filters) {
    const conditions = ['user_id = $1'];
    const params = [userId];

    if (filters?.date) {
      params.push(filters.date);
      conditions.push(`reading_date = $${params.length}`);
    }
    if (filters?.from) {
      params.push(filters.from);
      conditions.push(`reading_date >= $${params.length}`);
    }
    if (filters?.to) {
      params.push(filters.to);
      conditions.push(`reading_date <= $${params.length}`);
    }
    if (filters?.slot) {
      params.push(filters.slot);
      conditions.push(`slot = $${params.length}`);
    }

    let limitClause = '';
    if (Number.isInteger(filters?.limit) && filters.limit > 0) {
      params.push(filters.limit);
      limitClause += ` LIMIT $${params.length}`;
      if (Number.isInteger(filters?.offset) && filters.offset >= 0) {
        params.push(filters.offset);
        limitClause += ` OFFSET $${params.length}`;
      }
    }

    const result = await this.db.query(
      `SELECT id,
              user_id,
              TO_CHAR(reading_date, 'YYYY-MM-DD') AS reading_date,
              slot,
              value,
              note,
              created_at,
              updated_at
         FROM readings
        WHERE ${conditions.join(' AND ')}
        ORDER BY reading_date DESC,
          CASE slot
            WHEN 'morning_fasting' THEN 1
            WHEN 'after_breakfast' THEN 2
            WHEN 'after_lunch' THEN 3
            WHEN 'after_dinner' THEN 4
            ELSE 5
          END ASC${limitClause}`,
      params
    );

    return result.rows.map(mapReadingRow);
  }

  async countReadingsByUser(userId, filters) {
    const conditions = ['user_id = $1'];
    const params = [userId];

    if (filters?.date) {
      params.push(filters.date);
      conditions.push(`reading_date = $${params.length}`);
    }
    if (filters?.from) {
      params.push(filters.from);
      conditions.push(`reading_date >= $${params.length}`);
    }
    if (filters?.to) {
      params.push(filters.to);
      conditions.push(`reading_date <= $${params.length}`);
    }
    if (filters?.slot) {
      params.push(filters.slot);
      conditions.push(`slot = $${params.length}`);
    }

    const result = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM readings WHERE ${conditions.join(' AND ')}`,
      params
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async findReadingByIdForUser(readingId, userId) {
    const result = await this.db.query(
      `SELECT id,
              user_id,
              TO_CHAR(reading_date, 'YYYY-MM-DD') AS reading_date,
              slot,
              value,
              note,
              created_at,
              updated_at
         FROM readings
        WHERE id = $1 AND user_id = $2
        LIMIT 1`,
      [readingId, userId]
    );
    const row = result.rows[0];
    return row ? mapReadingRow(row) : null;
  }

  async createReading({ userId, readingDate, slot, value, note }) {
    const cleanNote = note?.trim() ? note.trim().slice(0, 280) : null;
    const result = await this.db.query(
      `INSERT INTO readings (user_id, reading_date, slot, value, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id,
                 user_id,
                 TO_CHAR(reading_date, 'YYYY-MM-DD') AS reading_date,
                 slot,
                 value,
                 note,
                 created_at,
                 updated_at`,
      [userId, readingDate, slot, value, cleanNote]
    );
    return mapReadingRow(result.rows[0]);
  }

  async updateReading({ id, userId, value, note }) {
    const cleanNote = note?.trim() ? note.trim().slice(0, 280) : null;
    const result = await this.db.query(
      `UPDATE readings
          SET value = $1,
              note = $2,
              updated_at = NOW()
        WHERE id = $3 AND user_id = $4
       RETURNING id,
                 user_id,
                 TO_CHAR(reading_date, 'YYYY-MM-DD') AS reading_date,
                 slot,
                 value,
                 note,
                 created_at,
                 updated_at`,
      [value, cleanNote, id, userId]
    );
    const row = result.rows[0];
    return row ? mapReadingRow(row) : null;
  }

  async deleteReading(readingId, userId) {
    const result = await this.db.query(
      `DELETE FROM readings
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [readingId, userId]
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }

  async listChatMessages(userId) {
    const result = await this.db.query(
      `SELECT id, user_id, role, content, created_at
         FROM chat_messages
        WHERE user_id = $1
        ORDER BY created_at ASC, id ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      createdAt: toIsoString(row.created_at),
    }));
  }

  async createChatMessage({ userId, role, content }) {
    const cleanContent = content.trim().slice(0, 8000);
    const result = await this.db.query(
      `INSERT INTO chat_messages (user_id, role, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, role, content, created_at`,
      [userId, role, cleanContent]
    );
    const row = result.rows[0];
    return {
      id: String(row.id),
      userId: String(row.user_id),
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      createdAt: toIsoString(row.created_at),
    };
  }

  async runInTransaction(callback) {
    if (typeof this.db.connect !== 'function') {
      return callback(this);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const txRepo = new SweetyRepository(client);
      const result = await callback(txRepo);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure on broken connection
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async saveChatExchange({ userId, userContent, assistantContent }) {
    return this.runInTransaction(async (txRepo) => {
      const userMessage = await txRepo.createChatMessage({
        userId,
        role: 'user',
        content: userContent,
      });
      const assistantMessage = await txRepo.createChatMessage({
        userId,
        role: 'assistant',
        content: assistantContent,
      });
      return { userMessage, assistantMessage };
    });
  }

  async clearChatMessages(userId) {
    await this.db.query(
      `DELETE FROM chat_messages WHERE user_id = $1`,
      [userId]
    );
  }
}
