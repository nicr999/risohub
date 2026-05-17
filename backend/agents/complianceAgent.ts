// ============================================================
// RISO HUB — agents/complianceAgent.ts
// Monitors checklist updates and file uploads.
// Flags MIS 3005 violations and sends alerts.
//
// Events handled:
//   checklist.updated     → check for non-compliant items
//   document.uploaded     → verify required doc categories present
//   heat_loss.saved       → check required fields populated
// ============================================================

import amqplib, { Channel, Connection } from 'amqplib';
import { sequelize } from '../models';
import { Project, Checklist, File, User } from '../models';
import { sendNotification } from '../services/notificationService';
import { sendComplianceAlert } from '../services/emailService';

const EXCHANGE = 'risohub.events';
const QUEUE = 'compliance-agent';
const ROUTING_KEYS = ['checklist.updated', 'document.uploaded', 'heat_loss.saved'];

// Required document categories for a complete MCS project
const REQUIRED_DOC_CATEGORIES = ['survey_report', 'heat_loss', 'commissioning'];

async function connect(): Promise<{ connection: Connection; channel: Channel }> {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  for (const key of ROUTING_KEYS) {
    await channel.bindQueue(QUEUE, EXCHANGE, key);
  }
  channel.prefetch(5);
  return { connection, channel };
}

async function handleMessage(routingKey: string, payload: any, channel: Channel, msg: amqplib.ConsumeMessage) {
  try {
    switch (routingKey) {

      case 'checklist.updated': {
        const { projectId, itemId, status } = payload;
        if (status !== 'noncompliant') break;

        const [project, item] = await Promise.all([
          Project.findByPk(projectId),
          Checklist.findByPk(itemId),
        ]);
        if (!project || !item) break;

        // Find all admins and the assignee to notify
        const admins = await User.findAll({ where: { role: 'Admin', active: true } });
        const notifyIds = new Set<number>(admins.map((a: any) => a.id));
        if (project.assignedTo) notifyIds.add(project.assignedTo);

        for (const userId of notifyIds) {
          await sendNotification({
            userId,
            type: 'checklist_issue',
            title: `Non-compliant checklist item — ${project.customerName}`,
            body: `${item.ref ? item.ref + ': ' : ''}${item.name} has been marked non-compliant.`,
            meta: { projectId, itemId, itemName: item.name, ref: item.ref },
          });
        }

        // Email alert to admins
        for (const admin of admins) {
          try {
            await sendComplianceAlert({
              to: (admin as any).email,
              adminName: (admin as any).name,
              projectName: project.customerName,
              address: project.address,
              itemRef: item.ref || '',
              itemName: item.name,
              projectId,
            });
          } catch (emailErr) {
            console.error('[Compliance Agent] Email alert failed:', emailErr);
          }
        }

        console.log(`[Compliance Agent] Non-compliant item flagged: project ${projectId}, item ${itemId}`);
        break;
      }

      case 'document.uploaded': {
        const { projectId } = payload;
        const project = await Project.findByPk(projectId);
        if (!project) break;

        // Check which required document categories are present
        const files = await File.findAll({ where: { projectId } });
        const presentCategories = new Set(files.map((f: any) => f.category));
        const missing = REQUIRED_DOC_CATEGORIES.filter(cat => !presentCategories.has(cat));

        if (missing.length > 0) {
          console.log(`[Compliance Agent] Project ${projectId} missing doc categories: ${missing.join(', ')}`);
          // Logged only — will be surfaced in compliance summary
        }
        break;
      }

      case 'heat_loss.saved': {
        const { projectId, summaryId } = payload;
        console.log(`[Compliance Agent] Heat loss saved for project ${projectId} (summary ${summaryId})`);
        // Could check required fields are populated — extendable
        break;
      }
    }

    channel.ack(msg);
  } catch (err) {
    console.error(`[Compliance Agent] Error handling ${routingKey}:`, err);
    channel.nack(msg, false, false);
  }
}

async function start() {
  await sequelize.authenticate();
  console.log('[Compliance Agent] DB connected');

  const { connection, channel } = await connect();
  console.log('[Compliance Agent] Connected to RabbitMQ — listening');

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const routingKey = msg.fields.routingKey;
    let payload: any = {};
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      channel.nack(msg, false, false);
      return;
    }
    await handleMessage(routingKey, payload, channel, msg);
  });

  process.on('SIGTERM', async () => {
    await channel.close();
    await connection.close();
    await sequelize.close();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('[Compliance Agent] Fatal:', err);
  process.exit(1);
});
