import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';
import { DriveSync } from '../models/index';

const router = Router();


// ─── GET /api/drive-sync/status/:projectId ────────────────────────────────────

router.get('/status/:projectId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query as Record<string, string>;

    const where: any = { projectId };
    if (status) where.status = status;

    const records = await DriveSync.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    const summary = {
      total: records.length,
      synced: records.filter(r => r.status === 'synced').length,
      pending: records.filter(r => r.status === 'pending').length,
      failed: records.filter(r => r.status === 'failed').length,
      skipped: records.filter(r => r.status === 'skipped').length,
    };

    res.json({ projectId, summary, records });
  } catch (err) {
    console.error('GET /api/drive-sync/status error:', err);
    res.status(500).json({ error: 'Failed to fetch Drive sync status' });
  }
});

// ─── POST /api/drive-sync/retry/:projectId ───────────────────────────────────
// Requeue all failed items for a project

router.post('/retry/:projectId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const failed = await DriveSync.findAll({
      where: { projectId, status: 'failed' },
    });

    if (failed.length === 0) {
      return res.json({ message: 'No failed items to retry', retried: 0 });
    }

    for (const record of failed) {
      // Reset status so the worker picks it up again
      await record.update({ status: 'pending', lastError: null });

      await publishEvent('drive.syncRetry', {
        syncId: record.id,
        projectId,
        s3Key: record.s3Key,
        fileName: record.fileName,
        mimeType: record.mimeType,
        stage: record.stage,
        entityType: record.entityType,
        entityId: record.entityId,
      });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'driveSync.retried',
      entityType: 'Project',
      entityId: projectId,
      newValue: { retriedCount: failed.length },
      ipAddress: req.ip,
    });

    res.json({ message: `Retrying ${failed.length} failed item(s)`, retried: failed.length });
  } catch (err) {
    console.error('POST /api/drive-sync/retry error:', err);
    res.status(500).json({ error: 'Failed to retry Drive sync' });
  }
});

// ─── POST /api/drive-sync/resync/:projectId ───────────────────────────────────
// Full resync — requeue every file for a project regardless of current status

router.post('/resync/:projectId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const all = await DriveSync.findAll({ where: { projectId } });

    if (all.length === 0) {
      return res.json({ message: 'No sync records found for this project', queued: 0 });
    }

    for (const record of all) {
      await record.update({ status: 'pending', attempts: 0, lastError: null, syncedAt: null });

      await publishEvent('drive.syncRetry', {
        syncId: record.id,
        projectId,
        s3Key: record.s3Key,
        fileName: record.fileName,
        mimeType: record.mimeType,
        stage: record.stage,
        entityType: record.entityType,
        entityId: record.entityId,
      });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'driveSync.fullResync',
      entityType: 'Project',
      entityId: projectId,
      newValue: { queuedCount: all.length },
      ipAddress: req.ip,
    });

    res.json({ message: `Full resync queued for ${all.length} item(s)`, queued: all.length });
  } catch (err) {
    console.error('POST /api/drive-sync/resync error:', err);
    res.status(500).json({ error: 'Failed to resync project' });
  }
});

// ─── GET /api/drive-sync/health ───────────────────────────────────────────────
// Global Drive sync health across all projects

router.get('/health', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [total, synced, failed, pending, recentFailed] = await Promise.all([
      DriveSync.count(),
      DriveSync.count({ where: { status: 'synced' } }),
      DriveSync.count({ where: { status: 'failed' } }),
      DriveSync.count({ where: { status: 'pending' } }),
      DriveSync.count({ where: { status: 'failed', createdAt: { [Op.gte]: last24h } } }),
    ]);

    // Get the most recent failures for display
    const recentFailures = await DriveSync.findAll({
      where: { status: 'failed' },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    const syncRate = total > 0 ? Math.round((synced / total) * 100) : 100;
    const healthy = failed === 0 && pending < 50;

    res.json({
      healthy,
      syncRate,
      total,
      synced,
      failed,
      pending,
      recentFailed,
      recentFailures,
      checkedAt: now.toISOString(),
    });
  } catch (err) {
    console.error('GET /api/drive-sync/health error:', err);
    res.status(500).json({ error: 'Failed to fetch Drive sync health' });
  }
});

export default router;
