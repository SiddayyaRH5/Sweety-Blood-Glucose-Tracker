-- Sweety – Blood Glucose Tracker
-- PostgreSQL Schema & Initial Migration (001_initial_schema.sql)

BEGIN;

DO $$
BEGIN
  CREATE TYPE reading_slot AS ENUM (
    'morning_fasting',
    'after_breakfast',
    'after_lunch',
    'after_dinner'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL CHECK (char_length(trim(name)) >= 1),
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS readings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reading_date DATE NOT NULL CHECK (reading_date <= CURRENT_DATE),
  slot reading_slot NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 40 AND value <= 600),
  note VARCHAR(280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_date_slot UNIQUE (user_id, reading_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_readings_user_date
  ON readings (user_id, reading_date DESC);

CREATE INDEX IF NOT EXISTS idx_readings_user_month
  ON readings (user_id, date_trunc('month', reading_date::timestamp));

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1 AND char_length(content) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages (user_id, created_at ASC, id ASC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_readings_updated_at ON readings;
CREATE TRIGGER trg_readings_updated_at
  BEFORE UPDATE ON readings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_max_four_readings_per_day()
RETURNS TRIGGER AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.user_id);

  SELECT COUNT(*)
    INTO existing_count
    FROM readings
   WHERE user_id = NEW.user_id
     AND reading_date = NEW.reading_date
     AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF existing_count >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 blood glucose readings per day exceeded for user % on %',
      NEW.user_id, NEW.reading_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_readings_max_four_per_day ON readings;
CREATE TRIGGER trg_readings_max_four_per_day
  BEFORE INSERT OR UPDATE OF user_id, reading_date ON readings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_four_readings_per_day();

COMMIT;
