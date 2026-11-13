# Sweety – Blood Glucose Tracker

Sweety is a full-stack blood glucose tracking and analytics web application built with React, Vite, Tailwind CSS, Node.js, Express.js, JWT, bcrypt, PostgreSQL, and server-side Gemini AI (`@google/genai`).

## Core Features

- **User Authentication (`JWT` + `bcrypt`)**: Register with name, email, and password (`POST /api/auth/register`), sign in (`POST /api/auth/login`), verify session (`GET /api/auth/me`), and sign out (`POST /api/auth/logout`). Passwords are hashed with `bcryptjs` and password hashes are never exposed in API responses.
- **Per-User Data Isolation**: Every reading, report, and Care Assistant chat query is scoped strictly to the authenticated user (`req.user.id`) in PostgreSQL.
- **Add, View, Edit & Delete Readings**: Log up to 4 readings per day across `Morning (fasting)`, `After breakfast`, `After lunch`, and `After dinner`, with edit modals, delete confirmation, and search/slot filtering.
- **Multi-Layer Strict Validation** (UI + Express API + PostgreSQL constraints/triggers):
  - Required integer glucose values between `40` and `600 mg/dl` (no decimals)
  - No future dates (`reading_date <= CURRENT_DATE`)
  - Valid reading slot enum (`reading_slot`)
  - One reading per `(user_id, reading_date, slot)` (`uq_user_date_slot`)
  - Database trigger (`trg_readings_max_four_per_day`) enforcing at most 4 readings per user per day
- **Reports & Visualization**:
  - **Daily Report** (`GET /api/reports/daily?date=YYYY-MM-DD`): highest, lowest, 1-decimal average, reading count, slot-by-slot list, and empty state.
  - **Month-to-Date Report** (`GET /api/reports/month-to-date?date=YYYY-MM-DD`): 1st of month through selected date, slot breakdown, trend chart, CSV export, and empty state.
  - **Previous Month Report** (`GET /api/reports/previous-month?date=YYYY-MM-DD`): full previous calendar month summary, slot breakdown, trend chart, CSV export, and empty state.
- **Pagination**: `GET /api/readings?page=1&limit=20` returns paginated readings and metadata (`page`, `limit`, `total`, `totalPages`).
- **Gemini Care Assistant**: Pattern insights (`POST /api/ai/insights`) and multi-turn wellness chat (`GET/POST/DELETE /api/ai/chat`) stored in PostgreSQL with `GEMINI_API_KEY` kept strictly on the server.

## Technology Stack

- **Frontend**: React 19, JavaScript (ES6+), Vite, Tailwind CSS v4, React Router, Axios, Lucide React
- **Backend**: Node.js (ES modules), Express.js, `pg` connection pool, `jsonwebtoken`, `bcryptjs`, Helmet, CORS, Express Rate Limit, `@google/genai`
- **Database**: PostgreSQL 15+ (local PostgreSQL, Docker PostgreSQL, or Neon PostgreSQL)

## Prerequisites & Installation

1. Install Node.js 20+ and PostgreSQL 15+ (or Docker).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your local values:
   ```bash
   cp .env.example .env
   ```
   Required variables (see `.env.example`):
   - `PORT=3000`
   - `NODE_ENV=development`
   - `DATABASE_URL` (e.g. `postgresql://postgres:postgres@localhost:5432/sweety` or your Neon pooled string)
   - `DATABASE_SSL` (`false` for local Postgres, `true` for Neon/hosted Postgres)
   - `PG_POOL_MAX=10`
   - `JWT_SECRET` (long random string)
   - `JWT_EXPIRES_IN=7d`
   - `GEMINI_API_KEY` (optional unless using AI Care Assistant)
   - `APP_URL=http://localhost:5173`
   - `CORS_ALLOWED_ORIGINS=http://localhost:5173`
   - `VITE_API_BASE_URL=http://localhost:3000/api`
   - `TEST_DATABASE_URL` (optional separate database/branch for `npm run test:pg`)

## Database Setup, Migrations & Seed Script

### Option A: Start PostgreSQL quickly with Docker
```bash
docker compose up -d db
```

### Option B: Run Migrations & Seed Demo Data
1. Verify live PostgreSQL connectivity (`SELECT version()`, `SELECT current_database()`, `SELECT NOW()`):
   ```bash
   npm run db:check
   ```
2. Apply schema migrations (`db/migrations/001_initial_schema.sql`):
   ```bash
   npm run db:migrate
   ```
3. Seed a demo user with sample readings across today, current month, and previous month:
   ```bash
   npm run db:seed
   ```
   Default seeded demo account:
   - **Email**: `demo@sweety.app`
   - **Password**: `DemoPass123!` (hashed with `bcrypt`; override via `SEED_DEMO_EMAIL`, `SEED_DEMO_NAME`, `SEED_DEMO_PASSWORD`)

## Running Server, Client & Tests

- **Run full-stack dev server (Express API + Vite middleware on `http://localhost:3000`)**:
  ```bash
  npm run dev
  ```
- **Run Vite frontend separately** (if pointing `VITE_API_BASE_URL=http://localhost:3000/api`):
  ```bash
  npx vite --port 5173
  ```
- **Build & run production server**:
  ```bash
  npm run build
  npm start
  ```
- **Run unit & HTTP API contract tests**:
  ```bash
  npm test
  ```
- **Run live PostgreSQL integration tests (20 end-to-end DB checks)**:
  ```bash
  npm run test:pg
  ```
- **Run syntax lint check**:
  ```bash
  npm run lint
  ```

## API Endpoints

- `GET /api/health` — Live PostgreSQL health check (`200` with `connected: true` only when `SELECT 1` succeeds; `503` otherwise).
- `POST /api/auth/register` — Register user (`name`, `email`, `password`).
- `POST /api/auth/login` — Authenticate user and issue JWT.
- `GET /api/auth/me` — Fetch authenticated user profile.
- `POST /api/auth/logout` — Sign out confirmation.
- `GET /api/readings` — List authenticated user's readings (supports `date`, `from`, `to`, `slot`, `page`, `limit`).
- `GET /api/readings/:id` — Fetch a single reading owned by the authenticated user.
- `POST /api/readings` — Create a validated blood glucose reading.
- `PUT /api/readings/:id` — Update reading value/note.
- `DELETE /api/readings/:id` — Delete reading.
- `GET /api/reports/daily?date=YYYY-MM-DD` — Daily report and 4-slot summary.
- `GET /api/reports/month-to-date?date=YYYY-MM-DD` — Month-to-date report.
- `GET /api/reports/previous-month?date=YYYY-MM-DD` — Previous calendar month report.
- `POST /api/ai/insights` — Server-side Gemini pattern analysis.
- `GET /api/ai/chat`, `POST /api/ai/chat`, `DELETE /api/ai/chat` — Persistent Care Assistant chat.

## Notes

### Assumptions
- **Patient Calendar Dates**: Readings store calendar dates (`YYYY-MM-DD`) rather than UTC timestamps so a late-evening reading belongs to the user's local day; the PostgreSQL `CHECK (reading_date <= CURRENT_DATE)` constraint assumes the database session timezone aligns reasonably with user dates when enforcing non-future dates at the DB level.
- **Edit Restrictions**: Editing an existing reading updates its glucose value and optional note while keeping `reading_date` and `slot` locked so slot uniqueness stays predictable; to move a reading to another slot or date, the user deletes and re-logs it.
- **Seed Safety**: `npm run db:seed` uses `ON CONFLICT DO NOTHING` and never truncates or overwrites existing user data.
- **AI Key Optionality**: Core tracking, auth, CRUD, and reporting work without `GEMINI_API_KEY`; Care Assistant endpoints return a `503` configuration message if no key is set.

### What I Would Improve With More Time
- Add React Testing Library + Vitest component tests specifically for `ReadingModal` validation states and `ReportsPage` date switching.
- Add Redis caching for daily/monthly report aggregates with automatic cache invalidation on reading mutations.
- Add a BullMQ background worker to flag users who have logged fewer than 4 readings before end-of-day.
- Add an optional clinician/doctor role with read-only patient assignment tables so care teams can inspect patient monthly reports.
- Wire GitHub Actions CI to spin up a Postgres service container and automatically run `npm run db:migrate`, `npm run test:pg`, `npm test`, `npm run lint`, and `npm run build` on every pull request.
