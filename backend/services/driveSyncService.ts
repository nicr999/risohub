/**
 * driveSyncService.ts
 *
 * Handles all Google Drive sync operations for RISO HUB.
 *
 * Architecture:
 *   - S3 is always authoritative. Drive is a secondary mirror.
 *   - Sync is async — it never blocks an upload or document generation.
 *   - Files are organised in Drive under:
 *       RISO HUB/
 *         └── {customerName} — {postcode}/
 *               ├── Survey/
 *               ├── Design/
 *               ├── Install/
 *               ├── Commission/
 *               └── Documents/
 *   - Each sync attempt is recorded in a DriveSync table (see schema below).
 *   - Failed syncs are retried with exponential back-off (max 5 attempts).
 *   - Drive folder IDs are cached in the Project record to avoid repeated lookups.
 *
 * Authentication:
 *   - Uses a Google service account (JSON key in env or Secret Manager).
 *   - Scopes: https://www.googleapis.com/auth/drive.file
 *   - Domain restriction: only writes to the configured root folder.
 *
 * Install:
 *   npm install googleapis @google-cloud/local-auth
 */

import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Project, File as FileRecord, Document, AuditLog } from "../models";
import { publishEvent } from "../events/rabbitMQ";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncJob {
  type:        "file" | "document";
  projectId:   string;
  entityId:    string;  // fileId or documentId
  s3Key:       string;
  fileName:    string;
  mimeType:    string;
  stage?:      string;  // "Survey" | "Design" | "Install" | "Commission"
  attempt?:    number;
}

export interface SyncResult {
  ok:          boolean;
  driveFileId?: string;
  driveUrl?:   string;
  error?:      string;
}

// Stored in DB — add a DriveSync table via migration (schema at bottom of file)
export interface DriveSyncRecord {
  id:          string;
  projectId:   string;
  entityType:  "file" | "document";
  entityId:    string;
  s3Key:       string;
  fileName:    string;
  driveFileId: string | null;
  driveUrl:    string | null;
  status:      "pending" | "synced" | "failed" | "skipped";
  attempts:    number;
  lastError:   string | null;
  syncedAt:    Date | null;
  createdAt:   Date;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS     = 5;
const BACK_OFF_BASE_MS = 2_000; // 2s, 4s, 8s, 16s, 32s

function backOffMs(attempt: number): number {
  return BACK_OFF_BASE_MS * Math.pow(2, attempt - 1);
}

// ─── Google Auth ──────────────────────────────────────────────────────────────

let _driveClient: drive_v3.Drive | null = null;

/**
 * Returns an authenticated Drive client.
 * Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON env var (JSON string)
 * or from a mounted secret file at GOOGLE_SERVICE_ACCOUNT_PATH.
 */
export async function getDriveClient(): Promise<drive_v3.Drive> {
  if (_driveClient) return _driveClient;

  let credentials: object;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const fs = await import("fs/promises");
    credentials = JSON.parse(
      await fs.readFile(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, "utf-8")
    );
  } else {
    throw new Error(
      "No Google service account credentials found. " +
      "Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_PATH."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  _driveClient = google.drive({ version: "v3", auth });
  return _driveClient;
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

/**
 * Finds a folder by name inside a parent, or creates it if not found.
 */
async function findOrCreateFolder(
  drive:    drive_v3.Drive,
  name:     string,
  parentId: string
): Promise<string> {
  // Search for existing
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents:  [parentId],
    },
    fields: "id",
  });

  return created.data.id!;
}

/**
 * Resolves (or creates) the full folder path for a project:
 *   Root → {customerName} — {postcode} → {stage}
 *
 * Caches the project-level folder ID in project.driveFolderId to avoid
 * repeated API calls on subsequent syncs.
 */
async function resolveProjectFolder(
  drive:     drive_v3.Drive,
  project:   any,
  stage:     string
): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured.");

  // Project-level folder
  let projectFolderId: string = project.driveFolderId;

  if (!projectFolderId) {
    const folderName = `${project.customerName} — ${project.postcode}`;
    projectFolderId  = await findOrCreateFolder(drive, folderName, rootFolderId);

    // Cache on project record
    await project.update({ driveFolderId: projectFolderId });
  }

  // Stage sub-folder (Survey / Design / Install / Commission / Documents)
  const stageFolderId = await findOrCreateFolder(drive, stage, projectFolderId);
  return stageFolderId;
}

// ─── S3 → Stream helper ───────────────────────────────────────────────────────

async function streamFromS3(s3Key: string): Promise<Readable> {
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const res = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key:    s3Key,
  }));

  if (!res.Body) throw new Error(`Empty S3 body for key: ${s3Key}`);
  return res.Body as Readable;
}

// ─── Core sync function ───────────────────────────────────────────────────────

/**
 * Syncs a single file from S3 to Google Drive.
 * If a Drive file with the same name already exists in the folder, it is
 * updated (new revision) rather than duplicated.
 */
export async function syncFileToDrive(job: SyncJob): Promise<SyncResult> {
  try {
    const drive   = await getDriveClient();
    const project = await Project.findByPk(job.projectId);
    if (!project) return { ok: false, error: "Project not found." };

    const stage        = job.stage ?? "Documents";
    const folderId     = await resolveProjectFolder(drive, project, stage);
    const fileStream   = await streamFromS3(job.s3Key);

    // Check if a file with this name already exists (for update vs create)
    const existing = await drive.files.list({
      q: `name='${job.fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });

    let driveFileId: string;

    if (existing.data.files && existing.data.files.length > 0) {
      // Update existing file — creates a new revision
      driveFileId = existing.data.files[0].id!;
      await drive.files.update({
        fileId:   driveFileId,
        media: {
          mimeType: job.mimeType,
          body:     fileStream,
        },
        fields: "id",
      });
    } else {
      // Create new file
      const created = await drive.files.create({
        requestBody: {
          name:    job.fileName,
          parents: [folderId],
        },
        media: {
          mimeType: job.mimeType,
          body:     fileStream,
        },
        fields: "id, webViewLink",
      });
      driveFileId = created.data.id!;
    }

    // Get the web view link
    const meta = await drive.files.get({
      fileId: driveFileId,
      fields: "webViewLink",
    });
    const driveUrl = meta.data.webViewLink ?? null;

    return { ok: true, driveFileId, driveUrl: driveUrl ?? undefined };

  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown Drive error" };
  }
}

// ─── Retry orchestrator ───────────────────────────────────────────────────────

/**
 * Attempts a sync job with exponential back-off.
 * Updates the DriveSyncRecord (or creates it on first attempt).
 * Emits drive.synced or drive.syncFailed events.
 */
export async function attemptSync(
  job:        SyncJob,
  syncRecord: any   // Sequelize DriveSyncRecord instance
): Promise<void> {
  const attempt = (syncRecord.attempts ?? 0) + 1;
  await syncRecord.update({ attempts: attempt, status: "pending" });

  // Back-off delay (skip on first attempt)
  if (attempt > 1) {
    await new Promise(r => setTimeout(r, backOffMs(attempt - 1)));
  }

  const result = await syncFileToDrive(job);

  if (result.ok) {
    await syncRecord.update({
      status:      "synced",
      driveFileId: result.driveFileId,
      driveUrl:    result.driveUrl,
      lastError:   null,
      syncedAt:    new Date(),
    });

    // Update the source record with the Drive URL
    if (job.type === "file") {
      await FileRecord.update(
        { driveUrl: result.driveUrl },
        { where: { id: job.entityId } }
      );
    } else if (job.type === "document") {
      await Document.update(
        { driveUrl: result.driveUrl },
        { where: { id: job.entityId } }
      );
    }

    await publishEvent("riso.events", "drive.synced", {
      projectId:   job.projectId,
      entityType:  job.type,
      entityId:    job.entityId,
      driveFileId: result.driveFileId,
      driveUrl:    result.driveUrl,
    });

  } else {
    await syncRecord.update({
      lastError: result.error,
      status:    attempt >= MAX_ATTEMPTS ? "failed" : "pending",
    });

    if (attempt >= MAX_ATTEMPTS) {
      await publishEvent("riso.events", "drive.syncFailed", {
        projectId:  job.projectId,
        entityType: job.type,
        entityId:   job.entityId,
        error:      result.error,
        attempts:   attempt,
      });

      // Log to AuditLog so admins can see it
      await AuditLog.create({
        timestamp:  new Date(),
        userId:     "system",
        action:     "drive.syncFailed",
        entityType: job.type === "file" ? "File" : "Document",
        entityId:   job.entityId,
        ipAddress:  "internal",
        metadata:   { error: result.error, attempts: attempt },
      });
    } else {
      // Re-queue for retry (the consumer will pick it up)
      await publishEvent("riso.events", "drive.syncRetry", {
        ...job,
        attempt,
      });
    }
  }
}

// ─── Bulk re-sync ─────────────────────────────────────────────────────────────

/**
 * Admin-triggered: re-syncs all failed or pending records for a project.
 * Returns counts of queued items.
 */
export async function requeueFailedSyncs(
  projectId: string
): Promise<{ queued: number }> {
  const { DriveSync } = await import("../models");

  const failed = await DriveSync.findAll({
    where: {
      projectId,
      status: ["failed", "pending"],
    },
  });

  let queued = 0;
  for (const record of failed) {
    await record.update({ attempts: 0, status: "pending", lastError: null });
    await publishEvent("riso.events", "drive.syncRetry", {
      type:      record.entityType,
      projectId: record.projectId,
      entityId:  record.entityId,
      s3Key:     record.s3Key,
      fileName:  record.fileName,
      mimeType:  record.mimeType ?? "application/octet-stream",
      stage:     record.stage,
      attempt:   0,
    });
    queued++;
  }

  return { queued };
}

/**
 * Admin-triggered: re-sync ALL files for a project from scratch.
 * Useful after a Drive folder is deleted or credentials change.
 */
export async function fullProjectResync(projectId: string): Promise<{ queued: number }> {
  const files = await FileRecord.findAll({ where: { projectId } });
  const docs  = await Document.findAll({ where: { projectId } });

  let queued = 0;

  for (const f of files) {
    const s3Key = (f as any).fileUrl?.split(".amazonaws.com/")[1];
    if (!s3Key) continue;

    await publishEvent("riso.events", "drive.syncQueued", {
      type:      "file",
      projectId,
      entityId:  f.id,
      s3Key,
      fileName:  (f as any).fileUrl.split("/").pop(),
      mimeType:  guessMime((f as any).category),
      stage:     stageFromCategory((f as any).stage),
      attempt:   0,
    });
    queued++;
  }

  for (const d of docs) {
    const s3Key = (d as any).pdfUrl?.split(".amazonaws.com/")[1];
    if (!s3Key) continue;

    await publishEvent("riso.events", "drive.syncQueued", {
      type:      "document",
      projectId,
      entityId:  d.id,
      s3Key,
      fileName:  `${(d as any).docType}-v${(d as any).version}.pdf`,
      mimeType:  "application/pdf",
      stage:     "Documents",
      attempt:   0,
    });
    queued++;
  }

  return { queued };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function guessMime(category?: string): string {
  if (!category) return "application/octet-stream";
  const lower = category.toLowerCase();
  if (lower.includes("pdf"))  return "application/pdf";
  if (lower.includes("jpg") || lower.includes("jpeg")) return "image/jpeg";
  if (lower.includes("png"))  return "image/png";
  if (lower.includes("docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.includes("xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

function stageFromCategory(stage?: string): string {
  const map: Record<string, string> = {
    survey:     "Survey",
    design:     "Design",
    install:    "Install",
    commission: "Commission",
  };
  return map[stage?.toLowerCase() ?? ""] ?? "Documents";
}

/*
 * ─── DriveSync DB Migration (add to your Sequelize migrations) ────────────────
 *
 * CREATE TABLE "DriveSync" (
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "projectId"   UUID NOT NULL REFERENCES "Projects"(id),
 *   "entityType"  VARCHAR(20) NOT NULL,   -- 'file' | 'document'
 *   "entityId"    UUID NOT NULL,
 *   "s3Key"       TEXT NOT NULL,
 *   "fileName"    TEXT NOT NULL,
 *   "mimeType"    TEXT,
 *   "stage"       TEXT,
 *   "driveFileId" TEXT,
 *   "driveUrl"    TEXT,
 *   "status"      VARCHAR(20) NOT NULL DEFAULT 'pending',
 *   "attempts"    INTEGER NOT NULL DEFAULT 0,
 *   "lastError"   TEXT,
 *   "syncedAt"    TIMESTAMPTZ,
 *   "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX ON "DriveSync"("projectId");
 * CREATE INDEX ON "DriveSync"("status");
 *
 * Also add to Projects table:
 *   ALTER TABLE "Projects" ADD COLUMN "driveFolderId" TEXT;
 *
 * Also add to Files and Documents tables:
 *   ALTER TABLE "Files"     ADD COLUMN "driveUrl" TEXT;
 *   ALTER TABLE "Documents" ADD COLUMN "driveUrl" TEXT;
 */
