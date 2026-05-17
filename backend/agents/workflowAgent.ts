// ============================================================
// RISO HUB — agents/workflowAgent.ts
// Listens on RabbitMQ for domain events and automatically
// advances project status through the pipeline.
//
// Events handled:
//   checklist.completed   → survey → design (if all S1/S2 done)
//   handover.generated    → commission → audit
//   signatures.captured   → marks project fully signed off
//   mcs.registered        → audit → complete
//   survey.completed      → logs customer satisfaction
// ============================================================

import amqplib, { Channel, Connection } from 'amqplib';
import { sequelize } from '../models';
import { Project, Checklist, Document, Signature } from '../models';
import { sendNotification } from '../services/notificationService';

const EXCHANGE = 'risohub.events';
const QUEUE = 'workflow-agent';
const ROUTING_KEYS = [
  'checklist.completed',
  'checklist.updated',
  'handover.generated',
  'signatures.captured',
  'mcs.registered',
  'survey.completed',
];

const STAGE_ORDER = ['survey', 'design', 'install', 'commission', 'audit', 'complete'];

async function connect(): Promise<{ connection: Connection; channel: Channel }> {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });

  for (const key of ROUTING_KEYS) {
    await channel.bindQueue(QUEUE, EXCHANGE, key);
  }

  channel.prefetch(3);
  return { connection, channel };
}

async function handleMessage(routingKey: string, payload: any, channel: Channel, msg: amqplib.ConsumeMessage) {
  try {
    switch (routingKey) {

      case 'checklist.completed':
      case 'checklist.updated': {
        const { projectId } = payload;
        if (!projectId) break;

        const project = await Project.findByPk(projectId);
        if (!project) break;

        // Check if all required checklist items are complete
        const items = await Checklist.findAll({ where: { projectId } });
        const required = items.filter(i => i.required && i.status !== 'na');
        const allComplete = required.length > 0 && required.every(i => i.status === 'complete');
        const anyNonCompliant = required.some(i => i.status === 'noncompliant');

        if (allComplete && !anyNonCompliant && project.status === 'survey') {
          await project.update({ status: 'design' });
          console.log(`[Workflow] Project ${projectId} advanced: survey → design`);

          if (project.assignedTo) {
            await sendNotification({
              userId: project.assignedTo,
              type: 'handover_ready',
              title: 'Checklist complete — ready for design stage',
              body: `${project.customerName} checklist is fully complete. Project advanced to design stage.`,
              meta: { projectId },
            });
          }
        }
        break;
      }

      case 'handover.generated': {
        const { projectId } = payload;
        const project = await Project.findByPk(projectId);
        if (!project) break;

        // Advance from commission → audit when handover doc generated
        if (project.status === 'commission') {
          await project.update({ status: 'audit' });
          console.log(`[Workflow] Project ${projectId} advanced: commission → audit`);
        }
        break;
      }

      case 'signatures.captured': {
        const { projectId } = payload;
        const project = await Project.findByPk(projectId);
        if (!project) break;

        // Check all signatures are captured
        const sigs = await Signature.findAll({ where: { projectId } });
        const allSigned = sigs.length > 0 && sigs.every(s => s.status === 'signed');

        if (allSigned && project.assignedTo) {
          await sendNotification({
            userId: project.assignedTo,
            type: 'signature_received',
            title: 'Customer signature received',
            body: `${project.customerName} has signed the handover document.`,
            meta: { projectId },
          });
        }
        break;
      }

      case 'mcs.registered': {
        const { projectId } = payload;
        const project = await Project.findByPk(projectId);
        if (!project) break;

        // MCS registration marks the final step — advance to complete
        if (project.status === 'audit') {
          await project.update({ status: 'complete' } as any);
          console.log(`[Workflow] Project ${projectId} advanced: audit → complete`);
        }
        break;
      }

      case 'survey.completed': {
        const { projectId, rating } = payload;
        console.log(`[Workflow] Survey completed for project ${projectId} — rating: ${rating}`);
        // Could trigger CRM update or follow-up task — extendable
        break;
      }
    }

    channel.ack(msg);
  } catch (err) {
    console.error(`[Workflow] Error handling ${routingKey}:`, err);
    // Nack with requeue=false after error to avoid infinite loops
    channel.nack(msg, false, false);
  }
}

async function start() {
  await sequelize.authenticate();
  console.log('[Workflow Agent] DB connected');

  const { connection, channel } = await connect();
  console.log('[Workflow Agent] Connected to RabbitMQ — listening');

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

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await channel.close();
    await connection.close();
    await sequelize.close();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('[Workflow Agent] Fatal:', err);
  process.exit(1);
});
