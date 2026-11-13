import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  hashPassword,
  requireAuth,
  signAuthToken,
  verifyPassword,
} from './auth.js';
import { checkDatabaseHealth, pgExecutor, sanitizeErrorMessage } from './db.js';
import { SweetyRepository } from './repositories/sweetyRepository.js';
import {
  generateGlucoseInsights,
  sendCareAssistantMessage,
} from './gemini.js';
import {
  buildDailyReport,
  buildMonthToDateReport,
  buildPreviousMonthReport,
  getLocalDateString,
  getMonthToDateBounds,
  getPreviousMonthBounds,
  isValidDateFormat,
  VALID_SLOTS,
  validateReadingInput,
} from '../src/utils/glucose.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPositiveIntId(id) {
  return /^\d+$/.test(id) && Number(id) > 0;
}

function getPgErrorCode(err) {
  if (err && typeof err === 'object' && 'code' in err) {
    return typeof err.code === 'string' ? err.code : undefined;
  }
  return undefined;
}

export function createApp(options = {}) {
  const app = express();
  const repo = new SweetyRepository(options.db ?? pgExecutor);
  const checkDbHealth = options.checkDbHealth ?? checkDatabaseHealth;
  const aiInsights = options.aiInsightsFn ?? generateGlucoseInsights;
  const aiChat = options.aiChatFn ?? sendCareAssistantMessage;
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Production-ready CORS configuration (Vercel frontend + local dev)
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    ...(process.env.APP_URL ? [process.env.APP_URL.trim()] : []),
    ...envOrigins,
  ]);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin) || !isProduction) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed by CORS policy'));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '512kb' }));

  const noopLimiter = (_req, _res, next) => next();

  const authLimiter =
    options.enableRateLimit === false
      ? noopLimiter
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 40,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: 'Too many authentication attempts. Please try again later.' },
        });

  const apiLimiter =
    options.enableRateLimit === false
      ? noopLimiter
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 400,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: 'Too many requests. Please wait a few minutes and try again.' },
        });

  const aiLimiter =
    options.enableRateLimit === false
      ? noopLimiter
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 45,
          standardHeaders: true,
          legacyHeaders: false,
          message: {
            error: 'AI rate limit reached. Please wait a moment before requesting more insights.',
          },
        });

  app.use('/api', apiLimiter);

  // Health check endpoint — verifies live PostgreSQL connectivity
  app.get('/api/health', async (_req, res) => {
    const dbStatus = await checkDbHealth();
    const isConnected = dbStatus === 'connected';
    res.status(isConnected ? 200 : 503).json({
      status: isConnected ? 'ok' : dbStatus === 'not_configured' ? 'unconfigured' : 'degraded',
      service: 'sweety-blood-glucose-tracker',
      database: dbStatus,
      connected: isConnected,
      timestamp: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // Authentication Endpoints (JWT + bcrypt + PostgreSQL)
  // ---------------------------------------------------------------------------

  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    try {
      const { name, email, password } = req.body ?? {};
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const rawPassword = typeof password === 'string' ? password : '';

      const errors = {};
      if (!cleanName) {
        errors.name = 'Full name is required.';
      } else if (cleanName.length > 120) {
        errors.name = 'Name must be 120 characters or fewer.';
      }

      if (!cleanEmail) {
        errors.email = 'Email address is required.';
      } else if (cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail)) {
        errors.email = 'Enter a valid email address.';
      }

      if (!rawPassword) {
        errors.password = 'Password is required.';
      } else if (rawPassword.length < 8) {
        errors.password = 'Password must be at least 8 characters long.';
      } else if (rawPassword.length > 128) {
        errors.password = 'Password must be 128 characters or fewer.';
      }

      if (Object.keys(errors).length > 0) {
        const firstError = Object.values(errors)[0];
        res.status(400).json({ error: firstError, errors });
        return;
      }

      const existing = await repo.findUserByEmail(cleanEmail);
      if (existing) {
        res.status(409).json({
          error: 'An account with this email address already exists.',
        });
        return;
      }

      const passwordHash = await hashPassword(rawPassword);
      const user = await repo.createUser({
        name: cleanName,
        email: cleanEmail,
        passwordHash,
      });

      const token = signAuthToken(user);
      res.status(201).json({ token, user });
    } catch (err) {
      if (getPgErrorCode(err) === '23505') {
        res.status(409).json({
          error: 'An account with this email address already exists.',
        });
        return;
      }
      next(err);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const rawPassword = typeof password === 'string' ? password : '';

      if (!cleanEmail || !rawPassword) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const stored = await repo.findUserByEmail(cleanEmail);
      if (!stored) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const matches = await verifyPassword(rawPassword, stored.passwordHash);
      if (!matches) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const publicUser = {
        id: stored.id,
        name: stored.name,
        email: stored.email,
        createdAt: stored.createdAt,
      };
      const token = signAuthToken(publicUser);
      res.json({ token, user: publicUser });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const user = await repo.findUserPublicById(userId);
      if (!user) {
        res.status(401).json({ error: 'Account not found or session expired.' });
        return;
      }

      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ loggedOut: true, message: 'Signed out successfully.' });
  });

  // ---------------------------------------------------------------------------
  // Blood Glucose Reading CRUD Endpoints (strictly scoped by req.user.id)
  // ---------------------------------------------------------------------------

  app.get('/api/readings', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const dateParam = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;
      const fromParam = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
      const toParam = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
      const slotParam = typeof req.query.slot === 'string' ? req.query.slot.trim() : undefined;

      if (dateParam && !isValidDateFormat(dateParam)) {
        res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
        return;
      }
      if (fromParam && !isValidDateFormat(fromParam)) {
        res.status(400).json({ error: 'Invalid from date format. Expected YYYY-MM-DD.' });
        return;
      }
      if (toParam && !isValidDateFormat(toParam)) {
        res.status(400).json({ error: 'Invalid to date format. Expected YYYY-MM-DD.' });
        return;
      }
      if (slotParam && !VALID_SLOTS.has(slotParam)) {
        res.status(400).json({ error: 'Invalid reading slot filter.' });
        return;
      }

      const pageRaw = req.query.page;
      const limitRaw = req.query.limit;
      const hasPagination = pageRaw !== undefined || limitRaw !== undefined;

      let page = 1;
      let limit = 20;
      if (hasPagination) {
        if (pageRaw !== undefined) {
          const parsedPage = Number(pageRaw);
          if (!Number.isInteger(parsedPage) || parsedPage < 1) {
            res.status(400).json({ error: 'Invalid page parameter. Must be a positive integer.' });
            return;
          }
          page = parsedPage;
        }
        if (limitRaw !== undefined) {
          const parsedLimit = Number(limitRaw);
          if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            res.status(400).json({ error: 'Invalid limit parameter. Must be an integer between 1 and 100.' });
            return;
          }
          limit = parsedLimit;
        }
      }

      const baseFilters = {
        date: dateParam,
        from: fromParam,
        to: toParam,
        slot: slotParam,
      };

      if (hasPagination) {
        const [total, readings] = await Promise.all([
          repo.countReadingsByUser(userId, baseFilters),
          repo.listReadingsByUser(userId, {
            ...baseFilters,
            limit,
            offset: (page - 1) * limit,
          }),
        ]);
        res.json({
          readings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        });
        return;
      }

      const readings = await repo.listReadingsByUser(userId, baseFilters);
      res.json({
        readings,
        pagination: {
          page: 1,
          limit: readings.length || 20,
          total: readings.length,
          totalPages: 1,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/readings/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const readingId = req.params.id;
      if (!isValidPositiveIntId(readingId)) {
        res.status(400).json({ error: 'Invalid reading ID.' });
        return;
      }

      const reading = await repo.findReadingByIdForUser(readingId, userId);
      if (!reading) {
        res.status(404).json({ error: 'Reading not found.' });
        return;
      }

      res.json({ reading });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/readings', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { readingDate, slot, value, note } = req.body ?? {};
      const cleanDate = typeof readingDate === 'string' ? readingDate.trim() : '';

      const sameDayReadings = isValidDateFormat(cleanDate)
        ? await repo.listReadingsByUser(userId, { date: cleanDate })
        : [];

      const validation = validateReadingInput(
        { readingDate: cleanDate, slot, value, note },
        sameDayReadings,
        undefined,
        getLocalDateString()
      );

      if (!validation.valid || validation.parsedValue === undefined) {
        const isDuplicateSlot = Boolean(
          validation.errors.slot && validation.errors.slot.includes('already have')
        );
        const firstMsg =
          validation.errors.general ||
          validation.errors.value ||
          validation.errors.readingDate ||
          validation.errors.slot ||
          validation.errors.note ||
          'Invalid reading payload.';
        res.status(isDuplicateSlot ? 409 : 400).json({
          error: firstMsg,
          errors: validation.errors,
        });
        return;
      }

      const reading = await repo.createReading({
        userId,
        readingDate: cleanDate,
        slot,
        value: validation.parsedValue,
        note: typeof note === 'string' ? note : undefined,
      });

      res.status(201).json({ reading });
    } catch (err) {
      const pgCode = getPgErrorCode(err);
      if (pgCode === '23505') {
        res.status(409).json({
          error: 'You already have a reading for this slot on this date.',
        });
        return;
      }
      if (pgCode === '23514' || pgCode === '22P02') {
        const msg =
          err instanceof Error && err.message.includes('Maximum of 4')
            ? 'You can add only 4 readings per day.'
            : 'Reading failed database integrity constraints.';
        res.status(400).json({ error: msg });
        return;
      }
      next(err);
    }
  });

  app.put('/api/readings/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const readingId = req.params.id;
      if (!isValidPositiveIntId(readingId)) {
        res.status(400).json({ error: 'Invalid reading ID.' });
        return;
      }

      const existing = await repo.findReadingByIdForUser(readingId, userId);
      if (!existing) {
        res.status(404).json({ error: 'Reading not found.' });
        return;
      }

      const { value, note, readingDate, slot } = req.body ?? {};
      if (readingDate !== undefined && String(readingDate).trim() !== existing.readingDate) {
        res.status(400).json({ error: 'Reading date cannot be changed when editing an existing slot.' });
        return;
      }
      if (slot !== undefined && String(slot).trim() !== existing.slot) {
        res.status(400).json({ error: 'Reading slot cannot be changed when editing an existing slot.' });
        return;
      }

      const validation = validateReadingInput(
        {
          readingDate: existing.readingDate,
          slot: existing.slot,
          value,
          note,
        },
        [existing],
        existing.id,
        getLocalDateString()
      );

      if (!validation.valid || validation.parsedValue === undefined) {
        const firstMsg =
          validation.errors.value ||
          validation.errors.note ||
          validation.errors.general ||
          'Invalid reading update payload.';
        res.status(400).json({
          error: firstMsg,
          errors: validation.errors,
        });
        return;
      }

      const updated = await repo.updateReading({
        id: existing.id,
        userId,
        value: validation.parsedValue,
        note: note === null ? '' : typeof note === 'string' ? note : existing.note,
      });

      if (!updated) {
        res.status(404).json({ error: 'Reading not found.' });
        return;
      }

      res.json({ reading: updated });
    } catch (err) {
      const pgCode = getPgErrorCode(err);
      if (pgCode === '23514' || pgCode === '22P02') {
        res.status(400).json({ error: 'Reading failed database integrity constraints.' });
        return;
      }
      next(err);
    }
  });

  app.delete('/api/readings/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const readingId = req.params.id;
      if (!isValidPositiveIntId(readingId)) {
        res.status(400).json({ error: 'Invalid reading ID.' });
        return;
      }

      const deleted = await repo.deleteReading(readingId, userId);
      if (!deleted) {
        res.status(404).json({ error: 'Reading not found.' });
        return;
      }

      res.json({ deleted: true, id: readingId });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // Reporting Endpoints (Daily, Month-to-Date, Previous-Month)
  // ---------------------------------------------------------------------------

  app.get('/api/reports/daily', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const dateParam =
        typeof req.query.date === 'string' && req.query.date.trim()
          ? req.query.date.trim()
          : getLocalDateString();

      if (!isValidDateFormat(dateParam)) {
        res.status(400).json({ error: 'Invalid date parameter. Expected YYYY-MM-DD.' });
        return;
      }

      const readings = await repo.listReadingsByUser(userId, { date: dateParam });
      res.json(buildDailyReport(readings, dateParam));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/reports/month-to-date', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const dateParam =
        typeof req.query.date === 'string' && req.query.date.trim()
          ? req.query.date.trim()
          : getLocalDateString();

      if (!isValidDateFormat(dateParam)) {
        res.status(400).json({ error: 'Invalid date parameter. Expected YYYY-MM-DD.' });
        return;
      }

      const bounds = getMonthToDateBounds(dateParam);
      const readings = await repo.listReadingsByUser(userId, {
        from: bounds.startDate,
        to: bounds.endDate,
      });
      res.json(buildMonthToDateReport(readings, dateParam));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/reports/previous-month', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const dateParam =
        typeof req.query.date === 'string' && req.query.date.trim()
          ? req.query.date.trim()
          : getLocalDateString();

      if (!isValidDateFormat(dateParam)) {
        res.status(400).json({ error: 'Invalid date parameter. Expected YYYY-MM-DD.' });
        return;
      }

      const bounds = getPreviousMonthBounds(dateParam);
      const readings = await repo.listReadingsByUser(userId, {
        from: bounds.startDate,
        to: bounds.endDate,
      });
      res.json(buildPreviousMonthReport(readings, dateParam));
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // Gemini Care Assistant Endpoints (Server-Side API Key + PostgreSQL History)
  // ---------------------------------------------------------------------------

  app.post('/api/ai/insights', aiLimiter, requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { periodLabel } = req.body ?? {};
      const readings = await repo.listReadingsByUser(userId);

      if (readings.length === 0) {
        res.status(400).json({
          error: 'Log at least one glucose reading to generate AI insights.',
        });
        return;
      }

      const label =
        typeof periodLabel === 'string' && periodLabel.trim()
          ? periodLabel.trim().slice(0, 80)
          : 'Recent Readings';

      const insights = await aiInsights(readings, label);
      res.json({ insights });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ai/chat', requireAuth, async (req, res, next) => {
    try {
      const messages = await repo.listChatMessages(req.user.id);
      res.json({ messages });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ai/chat', aiLimiter, requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { message } = req.body ?? {};
      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'A non-empty message is required.' });
        return;
      }
      const trimmed = message.trim();
      if (trimmed.length > 2000) {
        res.status(400).json({ error: 'Message must be 2,000 characters or fewer.' });
        return;
      }

      const [existingMessages, readings] = await Promise.all([
        repo.listChatMessages(userId),
        repo.listReadingsByUser(userId),
      ]);

      const history = existingMessages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const reply = await aiChat(trimmed, history, readings);

      const { userMessage, assistantMessage } = await repo.saveChatExchange({
        userId,
        userContent: trimmed,
        assistantContent: reply,
      });

      res.status(201).json({
        reply,
        userMessage,
        assistantMessage,
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/ai/chat', requireAuth, async (req, res, next) => {
    try {
      await repo.clearChatMessages(req.user.id);
      res.json({ cleared: true });
    } catch (err) {
      next(err);
    }
  });

  // Centralized API error handler
  app.use('/api', (err, _req, res, _next) => {
    if (err && typeof err === 'object' && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }

    const message = sanitizeErrorMessage(err);
    console.error('[Sweety API Error]:', message);

    if (message.includes('Origin not allowed by CORS')) {
      res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
      return;
    }
    if (message.includes('PostgreSQL is not configured')) {
      res.status(503).json({
        error: 'Database is not configured on this server. Set DATABASE_URL and run migrations.',
      });
      return;
    }
    if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
      res.status(502).json({
        error: 'Gemini API key error. Please verify GEMINI_API_KEY on the server.',
      });
      return;
    }
    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
      res.status(429).json({
        error: 'Gemini API quota temporarily reached. Please try again shortly.',
      });
      return;
    }
    if (message.includes('not configured')) {
      res.status(503).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}
