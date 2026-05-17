// ============================================================
// RISO HUB — src/scripts/workerEntrypoint.ts
// Single entrypoint for all background workers and cron jobs.
// Render runs separate containers per worker type, all using
// this same image, differentiated by WORKER_TYPE env var.
// ============================================================

const type = process.env.WORKER_TYPE;

if (!type) {
  console.error('WORKER_TYPE env var is required');
  process.exit(1);
}

console.log(`[Worker] Starting: ${type}`);

switch (type) {
  case 'email':
    require('../workers/emailWorker');
    break;

  case 'drive':
    require('../workers/driveSyncWorker');
    break;

  case 'workflow':
    require('../agents/workflowAgent');
    break;

  case 'compliance':
    require('../agents/complianceAgent');
    break;

  case 'cron_qual_expiry':
    runCron(async () => {
      const axios = require('axios');
      const url = `http://localhost:3001/api/qualifications/check-expiry`;
      // Internal cron — hits its own API with service token
      const res = await axios.post(url, {}, {
        headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` },
      });
      console.log('[Cron] Qual expiry check complete:', res.data);
    });
    break;

  case 'cron_complaint_check':
    runCron(async () => {
      const axios = require('axios');
      const res = await axios.post(
        `http://localhost:3001/api/complaints/check-overdue`,
        {},
        { headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` } }
      );
      console.log('[Cron] Complaint check complete:', res.data);
    });
    break;

  case 'cron_weekly_digest':
    runCron(async () => {
      const { sendWeeklyAnalyticsDigest } = require('../services/analyticsDigestService');
      await sendWeeklyAnalyticsDigest();
    });
    break;

  default:
    console.error(`Unknown WORKER_TYPE: ${type}`);
    process.exit(1);
}

async function runCron(fn: () => Promise<void>) {
  try {
    // Connect DB before running
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    await fn();
    console.log('[Cron] Complete');
    process.exit(0);
  } catch (err) {
    console.error('[Cron] Failed:', err);
    process.exit(1);
  }
}
