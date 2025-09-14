import Fastify from 'fastify';
import { Kafka } from 'kafkajs';

const fastify = Fastify({ logger: true });
const PORT = parseInt(process.env.PORT || '8082', 10);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

const TOPICS = {
  movie: 'movie-events',
  user: 'user-events',
  payment: 'payment-events',
};

const kafka = new Kafka({
  clientId: 'cinemaabyss-events-service',
  brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'cinemaabyss-events-consumers' });

async function startKafka() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topic: TOPICS.movie, fromBeginning: true });
  await consumer.subscribe({ topic: TOPICS.user, fromBeginning: true });
  await consumer.subscribe({ topic: TOPICS.payment, fromBeginning: true });

  // Получить 
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value ? message.value.toString() : '';
        fastify.log.info({ topic, partition, value }, 'Consumed event');
        console.log('event consumed')
      } catch (err) {
        fastify.log.error({ err }, 'Error processing consumed message');
      }
    },
  });
}

function buildEvent(type, payload) {
  return {
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

async function publish(topic, event) {
  const value = JSON.stringify(event);
  await producer.send({
    topic,
    messages: [{ value }],
  });
  return { status: 'success', event };
}

fastify.get('/api/events/health', async (_request, reply) => {
  reply.send({ status: true });
});

fastify.post('/api/events/movie', async (request, reply) => {
  try {
    const event = buildEvent('movie', request.body || {});
    const result = await publish(TOPICS.movie, event);
    reply.code(200).send(result);
  } catch (err) {
    request.log.error({ err }, 'Failed to publish movie event');
    reply.code(500).send({ error: 'Failed to publish movie event' });
  }
});

fastify.post('/api/events/user', async (request, reply) => {
  try {
    const event = buildEvent('user', request.body || {});
    const result = await publish(TOPICS.user, event);
    reply.code(200).send(result);
  } catch (err) {
    request.log.error({ err }, 'Failed to publish user event');
    reply.code(500).send({ error: 'Failed to publish user event' });
  }
});

fastify.post('/api/events/payment', async (request, reply) => {
  try {
    const event = buildEvent('payment', request.body || {});
    const result = await publish(TOPICS.payment, event);
    reply.code(200).send(result);
  } catch (err) {
    request.log.error({ err }, 'Failed to publish payment event');
    reply.code(500).send({ error: 'Failed to publish payment event' });
  }
});

(async () => {
  try {
    await startKafka();
    fastify.log.info({ brokers: KAFKA_BROKERS }, 'Kafka connected');
    const address = await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info({ address }, 'Events service started');
  } catch (err) {
    fastify.log.error({ err }, 'Failed to start events service');
    process.exit(1);
  }
})();
