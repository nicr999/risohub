/**
 * driveSyncWorker.ts
 *
 * Standalone Node.js worker process that consumes RabbitMQ events and
 * triggers Drive sync jobs. Run this as a separate process:
 *
 *   node -r ts-node/register src/workers/driveSyncWorker.ts
 *
 * Or in Docker Compose as a separate service sharing the same image:
 *
 *   drive-sync-worker:
 *     build: .
 *     command: node -r ts-node/register src/workers/driveSyncWorker.ts
 *     environment:
 *       - RABBITMQ_URL
 *       - GOOGLE_SERVICE_ACCOUNT_JSON
 *       - GOOGLE_DRIVE_ROOT_FOLDER_ID
 *       - AWS_REGION / S3_BUCKET
 *       - DATABASE_URL
 *     depends_on: [rabbitmq, postgres]
 *
 * Events consumed:
 *   riso.events → document.uploaded       { projectId, fileId, s3Key, fileName, mimeType, stage }
 *   riso.events → handover.generated      { projectId, documentId, s3Key }
 *   riso.events → drive.syncQueued        { SyncJob }   (admin full-resync)
 *   riso.events → drive.syncRetry         { SyncJob + attempt }
 *
 * Events emitted (by driveSyncService):
 *   riso.events → drive.synced
 *   riso.events → drive.syncFailed
 *   riso.events → drive.syncRetry
 *
 * Install:
 *   npm install amqplib
 *   npm install --save-dev @types/amqplib
 */

import amqp, { Channel, Connection, ConsumeMessage } from "amqplib";
import { attemptSync } from "./driveSyncService";
import { File as FileRecord, Document } from "../models";
import sequelize from "../db"; // your Sequelize instance

// ─── Config ───────────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost";
const EXCHANGE     = "riso.events";
const QUEUE        = "drive-sync-worker";
const PREFETCH     = 3; // max concurrent sync jobs

const ROUTING_KEYS = [
  "document.uploaded",
  "handover.generated",
  "drive.syncQueued",
  "drive.syncRetry",
];

// ─── DB model for sync records ────────────────────────────────────────────────

// Import or inline — adjust path to your models
async function getDriveSyncModel() {
  const { DriveSync } = await import("../models");
  return DriveSync;
}

// ─── Message handlers ─────────────────────────────────────────────────────────

async function handleDocumentUploaded(payload: any): Promise<void> {
  const { projectId, fileId, s3Key, fileName, mimeType, stage } = payload;
  if (!projectId || !fileId || !s3Key) {
    console.warn("[DriveSync] handleDocumentUploaded: missing required fields", payload);
    return;
  }

  const DriveSync = await getDriveSyncModel();

  // Idempotency: skip if already synced
  const existing = await DriveSync.findOne({
    where: { entityType: "file", entityId: fileId, status: "synced" },
  });
  if (existing) {
    console.log(`[DriveSync] File ${fileId} already synced, skipping.`);
    return;
  }

  const syncRecord = await DriveSync.findOrCreate({
    where:    { entityType: "file", entityId: fileId },
    defaults: {
      projectId,
      entityType: "file",
      entityId:   fileId,
      s3Key,
      fileName:   fileName ?? s3Key.split("/").pop(),
      mimeType:   mimeType ?? "application/octet-stream",
      stage:      stage ?? "Documents",
      status:     "pending",
      attempts:   0,
    },
  });

  const record = Array.isArray(syncRecord) ? syncRecord[0] : syncRecord;

  await attemptSync(
    {
      type:      "file",
      projectId,
      entityId:  fileId,
      s3Key,
      fileName:  fileName ?? s3Key.split("/").pop() ?? "file",
      mimeType:  mimeType ?? "application/octet-stream",
      stage:     stage ?? "Documents",
    },
    record
  );
}

async function handleHandoverGenerated(payload: any): Promise<void> {
  const { projectId, documentId, s3Key } = payload;
  if (!projectId || !documentId || !s3Key) {
    console.warn("[DriveSync] handleHandoverGenerated: missing required fields", payload);
    return;
  }

  const DriveSync = await getDriveSyncModel();

  const existing = await DriveSync.findOne({
    where: { entityType: "document", entityId: documentId, status: "synced" },
  });
  if (existing) {
    console.log(`[DriveSync] Document ${documentId} already synced, skipping.`);
    return;
  }

  // Look up the document to get version number
  const doc = await Document.findByPk(documentId);
  const fileName = doc
    ? `${(doc as any).docType}-v${(doc as any).version}.pdf`
    : `document-${documentId}.pdf`;

  const [record] = await DriveSync.findOrCreate({
    where:    { entityType: "document", entityId: documentId },
    defaults: {
      projectId,
      entityType: "document",
      entityId:   documentId,
      s3Key,
      fileName,
      mimeType:   "application/pdf",
      stage:      "Documents",
      status:     "pending",
      attempts:   0,
    },
  });

  await attemptSync(
    {
      type:      "document",
      projectId,
      entityId:  documentId,
      s3Key,
      fileName,
      mimeType:  "application/pdf",
      stage:     "Documents",
    },
    record
  );
}

async function handleSyncRetry(payload: any): Promise<void> {
  const DriveSync = await getDriveSyncModel();
  const { type, projectId, entityId, s3Key, fileName, mimeType, stage, attempt } = payload;

  if (!entityId) return;

  const record = await DriveSync.findOne({ where: { entityType: type, entityId } });
  if (!record) {
    console.warn(`[DriveSync] Retry: no record found for ${type} ${entityId}`);
    return;
  }

  if (record.status === "synced") {
    console.log(`[DriveSync] Retry: ${type} ${entityId} already synced, skipping.`);
    return;
  }

  await attemptSync({ type, projectId, entityId, s3Key, fileName, mimeType, stage, attempt }, record);
}

// ─── Message router ───────────────────────────────────────────────────────────

async function handleMessage(routingKey: string, payload: any): Promise<void> {
  console.log(`[DriveSync] ← ${routingKey}`, JSON.stringify(payload).slice(0, 120));

  switch (routingKey) {
    case "document.uploaded":
      await handleDocumentUploaded(payload);
      break;
    case "handover.generated":
      await handleHandoverGenerated(payload);
      break;
    case "drive.syncQueued":
    case "drive.syncRetry":
      await handleSyncRetry(payload);
      break;
    default:
      console.warn(`[DriveSync] Unhandled routing key: ${routingKey}`);
  }
}

// ─── Worker boot ──────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  // Init DB
  await sequelize.authenticate();
  console.log("[DriveSync] DB connected.");

  let connection: Connection;
  let channel: Channel;

  const connect = async () => {
    connection = await amqp.connect(RABBITMQ_URL);
    channel    = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await channel.assertQueue(QUEUE, {
      durable:   true,
      arguments: {
        "x-dead-letter-exchange": `${EXCHANGE}.dlx`,   // dead-letter queue
      },
    });

    for (const key of ROUTING_KEYS) {
      await channel.bindQueue(QUEUE, EXCHANGE, key);
    }

    channel.prefetch(PREFETCH);

    console.log(`[DriveSync] Worker ready. Listening on queue: ${QUEUE}`);

    channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const routingKey = msg.fields.routingKey;
      let payload: any;

      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        console.error("[DriveSync] Failed to parse message body — nacking.");
        channel.nack(msg, false, false); // send to DLQ
        return;
      }

      try {
        await handleMessage(routingKey, payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[DriveSync] Error handling ${routingKey}:`, err);
        // Requeue once; if it fails again it goes to DLQ
        const requeued = msg.fields.redelivered;
        channel.nack(msg, false, !requeued);
      }
    });

    // Handle connection drops
    connection.on("error", (err) => {
      console.error("[DriveSync] RabbitMQ connection error:", err.message);
    });
    connection.on("close", () => {
      console.warn("[DriveSync] RabbitMQ connection closed. Reconnecting in 5s…");
      setTimeout(connect, 5_000);
    });
  };

  await connect();
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  console.log("[DriveSync] SIGTERM received — shutting down gracefully.");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[DriveSync] SIGINT received — shutting down gracefully.");
  process.exit(0);
});

// ─── Entry point ──────────────────────────────────────────────────────────────

start().catch((err) => {
  console.error("[DriveSync] Fatal startup error:", err);
  process.exit(1);
});
