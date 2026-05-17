import { AuditLog } from '../models/index';

interface AuditParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: object | null;
  newValue?: object | null;
  ipAddress?: string | null;
  metadata?: object | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await AuditLog.create({
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      ipAddress: params.ipAddress ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    // Audit logging must never crash the main request
    console.error('auditService.logAudit failed:', err);
  }
}
