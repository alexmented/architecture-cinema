import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

const PORT = parseInt(process.env.PORT || '8000', 10);
const MONOLITH_URL = process.env.MONOLITH_URL || 'http://localhost:8080';
const MOVIES_SERVICE_URL = process.env.MOVIES_SERVICE_URL || 'http://localhost:8081';
const EVENTS_SERVICE_URL = process.env.EVENTS_SERVICE_URL || 'http://localhost:8082';
const GRADUAL_MIGRATION = (process.env.GRADUAL_MIGRATION || 'true').toLowerCase() === 'true';
const MOVIES_MIGRATION_PERCENT = Math.min(
  100,
  Math.max(0, parseInt(process.env.MOVIES_MIGRATION_PERCENT || '50', 10) || 0)
);

function chooseMoviesTarget() {
  if (!GRADUAL_MIGRATION) {
    return MOVIES_SERVICE_URL;
  }
  const dice = Math.floor(Math.random() * 100) + 1; 
  return dice <= MOVIES_MIGRATION_PERCENT ? MOVIES_SERVICE_URL : MONOLITH_URL;
}

async function proxyRequest(targetBaseUrl, request, reply, targetPath = '') {
  try {
    const base = new URL(targetBaseUrl);
    const fullUrl = base.origin + (targetPath || request.raw.url);

    const headers = { ...request.headers };
    delete headers['content-length'];
    delete headers['host'];
    delete headers['connection'];
    delete headers['accept-encoding'];

    const method = request.method?.toUpperCase() || 'GET';
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    let body;
    if (hasBody) {
      body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }

    const upstream = await fetch(fullUrl, {
      method,
      headers,
      body,
      // Required for Node 18+ undici when sending a body
      ...(hasBody ? { duplex: 'half' } : {}),
    });

    reply.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) reply.header('content-type', contentType);

    const buf = Buffer.from(await upstream.arrayBuffer());
    return reply.send(buf);
  } catch (err) {
    request.log.error({ err }, 'Proxy request failed');
    return reply.code(502).send({ error: 'Bad Gateway' });
  }
}

fastify.get('/health', async (request, reply) => {
  reply.type('text/plain').send('Strangler Fig Proxy is healthy');
});

fastify.all('/api/movies', async (request, reply) => {
  const target = chooseMoviesTarget();
  return proxyRequest(target, request, reply);
});

fastify.all('/api/movies/*', async (request, reply) => {
  const path = request.raw.url;
  const forceMoviesHealth = path.startsWith('/api/movies/health');
  const target = forceMoviesHealth ? MOVIES_SERVICE_URL : chooseMoviesTarget();
  return proxyRequest(target, request, reply);
});

fastify.all('/api/users', async (request, reply) => proxyRequest(MONOLITH_URL, request, reply));
fastify.all('/api/payments', async (request, reply) => proxyRequest(MONOLITH_URL, request, reply));
fastify.all('/api/subscriptions', async (request, reply) => proxyRequest(MONOLITH_URL, request, reply));
fastify.all('/api/events', async (request, reply) => proxyRequest(EVENTS_SERVICE_URL, request, reply));

fastify.listen({ port: PORT, host: '0.0.0.0' })
  .then((address) => {
    fastify.log.info({ address, MONOLITH_URL, MOVIES_SERVICE_URL, EVENTS_SERVICE_URL, GRADUAL_MIGRATION, MOVIES_MIGRATION_PERCENT }, 'Proxy started');
  })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
