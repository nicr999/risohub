import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

// ─── Phase 1–4 core routes ────────────────────────────────────────────────────
import authRoutes          from './auth/authRoutes';
import projectRoutes       from './routes/projectRoutes';
import userRoutes          from './routes/userRoutes';
import fileRoutes          from './routes/fileRoutes';
import checklistRoutes     from './routes/checklistRoutes';
import documentRoutes      from './routes/documentRoutes';
import signatureRoutes     from './routes/signatureRoutes';
import complaintRoutes     from './routes/complaintRoutes';
import notesRoutes         from './routes/notesRoutes';
import notificationRoutes  from './routes/notificationRoutes';
import qualificationRoutes from './routes/qualificationRoutes';
import auditLogRoutes      from './routes/auditLogRoutes';
import settingsRoutes      from './routes/settingsRoutes';
import driveSyncRoutes     from './routes/driveSyncRoutes';
import hubspotRoutes       from './routes/hubspotRoutes';

// ─── Phase 5 routes ───────────────────────────────────────────────────────────
import heatLossRoutes          from './routes/heatLossRoutes';
import mcsRoutes               from './routes/mcsRoutes';
import scheduleRoutes          from './routes/scheduleRoutes';
import subcontractorRoutes     from './routes/subcontractorRoutes';
import checklistEvidenceRoutes from './routes/checklistEvidenceRoutes';
import surveyRoutes            from './routes/surveyRoutes';
import reportRoutes            from './routes/reportRoutes';
import dashboardRoutes         from './routes/dashboardRoutes';

// ─── Phase 6 routes — EPC + BUS Eligibility ──────────────────────────────────
import epcRoutes            from './routes/epcAndBusRoutes';          // default export = epcRouter
import { busRouter }        from './routes/epcAndBusRoutes';          // named export  = busRouter

// ─── Phase 7+ routes ──────────────────────────────────────────────────────────
import analyticsRoutes      from './routes/analyticsRoutes';
import eligibilityRoutes    from './routes/eligibilityRoutes';
import phase7Routes         from './routes/phase7Routes';
import partnerRoutes        from './routes/partnerRoutes';
import webhookRoutes        from './routes/webhookRoutes';
import portalRoutes         from './routes/portalRoutes';

// ─── New feature routes ───────────────────────────────────────────────────────
import deviceTokenRoutes                         from './routes/deviceTokenRoutes';
import invoiceRoutes, { stripeWebhookHandler }  from './routes/invoiceRoutes';
import tenantRoutes                              from './routes/tenantRoutes';

import { resolveTenant }    from './auth/tenantMiddleware';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Tenant-ID'],
}));

// Resolve tenant for every request (non-blocking, sets req.tenantId)
app.use(resolveTenant);

// General rate limiter — 200 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict rate limiter for auth endpoints — 10 req / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// ─── General middleware ───────────────────────────────────────────────────────

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Stripe webhook MUST receive the raw body before express.json() parses it.
app.post('/api/invoices/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', limiter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─── Route registration — Phase 1–4 core ─────────────────────────────────────

app.use('/api/auth',                  authLimiter, authRoutes);
app.use('/api/projects',              projectRoutes);
app.use('/api/users',                 userRoutes);
app.use('/api/files',                 fileRoutes);
app.use('/api/checklist',             checklistRoutes);
app.use('/api/documents',             documentRoutes);
app.use('/api/signatures',            signatureRoutes);
app.use('/api/complaints',            complaintRoutes);
app.use('/api/notes',                 notesRoutes);
app.use('/api/notifications',         notificationRoutes);
app.use('/api/qualifications',        qualificationRoutes);
app.use('/api/audit-log',             auditLogRoutes);
app.use('/api/settings',              settingsRoutes);
app.use('/api/drive-sync',            driveSyncRoutes);
app.use('/api/integrations/hubspot',  hubspotRoutes);

// Compliance summary is handled inside projectRoutes:
// GET /api/compliance/summary/:projectId → projectRoutes

// ─── Route registration — Phase 5 ────────────────────────────────────────────

app.use('/api/heat-loss',       heatLossRoutes);
app.use('/api/mcs',             mcsRoutes);
app.use('/api/schedule',        scheduleRoutes);
app.use('/api/subcontractors',  subcontractorRoutes);
app.use('/api/checklist',       checklistEvidenceRoutes);  // merges under /api/checklist prefix
app.use('/api/surveys',         surveyRoutes);
app.use('/api/reports',         reportRoutes);
app.use('/api/dashboard',       dashboardRoutes);

// ─── Route registration — Phase 6 (EPC + BUS) ────────────────────────────────

app.use('/api/epc',  epcRoutes);   // GET/POST /api/epc/search, /api/epc/project/:id, etc.
app.use('/api/bus',  busRouter);   // GET/POST /api/bus/project/:id/assess, etc.

// ─── Route registration — Phase 7+ ───────────────────────────────────────────

app.use('/api/analytics',    analyticsRoutes);
app.use('/api/eligibility',  eligibilityRoutes);
app.use('/api/portal',       portalRoutes);
app.use('/api/webhooks',     webhookRoutes);
app.use('/api/partners',     partnerRoutes);
app.use('/api',              phase7Routes);

// ─── Route registration — New features ───────────────────────────────────────

// /webhook is handled above (before express.json) — the router handles all other invoice routes
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/device-tokens', deviceTokenRoutes);
app.use('/api/tenants',       tenantRoutes);

// ─── One-time admin seed endpoint ────────────────────────────────────────────
// Remove this block after seeding. Protected by SEED_SECRET env var.

app.post('/internal/seed-admin', async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const bcrypt = await import('bcrypt');
    const { v4: uuidv4 } = await import('uuid');
    const { User } = await import('./models/index');
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@risohome.co.uk';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
    const existing = await User.findOne({ where: { email: adminEmail } });
    if (existing) {
      return res.json({ status: 'already_exists', email: adminEmail });
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await User.create({
      id: uuidv4(),
      name: 'RISO Admin',
      email: adminEmail,
      role: 'Admin',
      passwordHash,
      twoFactorEnabled: false,
      active: true,
      failedLoginAttempts: 0,
    });
    return res.json({ status: 'created', email: adminEmail });
  } catch (err: any) {
    console.error('Seed failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

export default app;
