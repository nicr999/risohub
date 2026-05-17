import amqplib, { Connection, Channel } from 'amqplib';

let connection: Connection | null = null;
let channel: Channel | null = null;

const EXCHANGE = 'risohub.events';

async function getChannel(): Promise<Channel> {
  if (channel) return channel;

  const url = process.env.RABBITMQ_URL || 'amqp://localhost';
  connection = await amqplib.connect(url);
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err);
    channel = null;
    connection = null;
  });

  return channel;
}

/**
 * Publish an event to the RabbitMQ topic exchange.
 * Routing key matches the event name (e.g. 'checklist.completed').
 * Fails silently in development if RabbitMQ is not available.
 */
export async function publishEvent(routingKey: string, payload: object): Promise<void> {
  try {
    const ch = await getChannel();
    const message = Buffer.from(JSON.stringify({
      routingKey,
      payload,
      timestamp: new Date().toISOString(),
    }));

    ch.publish(EXCHANGE, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
    });
  } catch (err) {
    // Event bus failure must never crash the main request
    console.error(`eventBus.publishEvent(${routingKey}) failed:`, err);
  }
}

export async function closeEventBus(): Promise<void> {
  try {
    await channel?.close();
    await connection?.close();
  } catch (_) {}
}
