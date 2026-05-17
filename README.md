# RISO HUB — Complete Codebase

This archive contains every file built across all 7 phases of RISO HUB development.

## Structure

```
frontend/
  components/     — All React components (phases 1–7)
  pages/          — Full page components (ProjectsPage, ProjectDetailPage, AuditLogPage)
  auth/           — LoginPage, useAuth
  RisoHub.jsx     — Main dashboard shell
  main.tsx        — App entry point

backend/
  app.ts          — CANONICAL entry point (Phase 4 + 5 + 6 routes — use this)
  server.ts       — HTTP server bootstrap
  auth/           — authRoutes, authMiddleware, authService
  routes/         — All Express route files (phases 4–7)
  models/
    index.ts      — Main Sequelize model definitions (Phase 4 base)
    index.v6.ts   — Updated models index (Phase 5/6 additions)
    newModels.ts  — Phase 5 new models
    EPCAndBUSModels.ts — Phase 6 models
    phase7Models.ts    — Phase 7 models
  migrations/
    001-create-all-tables.ts
    002-add-hubspot-contact-id.ts
    003-v5-additions.ts
    004-epc-and-bus.ts
    005-phase7-additions.ts   ← run all 5 in order
  seeds/
    001-seed.ts   — Qualification types, admin user, checklist items
  services/       — All backend services
  agents/
    workflowAgent.ts   — Auto-advances project status
    complianceAgent.ts — Flags MIS 3005 violations
  scripts/
    migrate.ts         — Run all migrations
    workerEntrypoint.ts — Start email + driveSync workers
  config/
    database.ts   — Sequelize connection

mobile/           — React Native app (same API endpoints)

deployment/       — Docker, Render, Vercel configs

docs/
  RISOHUB_HANDOVER_v8.md  — Complete project brief (use this to continue in any AI session)
  PHASE7_PATCH.ts         — Instructions for wiring Phase 7 into app.ts
```

## To continue development

Paste `docs/RISOHUB_HANDOVER_v8.md` into a new Claude conversation.

## Before first launch

1. Run migrations in order: 001 → 002 → 003 → 004 → 005
2. Wire Phase 7 into app.ts (see docs/PHASE7_PATCH.ts)
3. Merge phase7Models.ts into models/index.ts
4. Set all environment variables (see deployment/.env.example)
5. Set up CloudAMQP for RabbitMQ in production

