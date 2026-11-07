const assert = require('node:assert/strict');
const { once } = require('node:events');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
const { test, after } = require('node:test');
const express = require('express');
const Transport = require('winston-transport');

// These checks never use application credentials, databases or network sockets.
process.env.LOKI_ENABLED = 'false';
process.env.LOG_LEVEL = 'info';
const { default: logger, createAppLogger } = require('../src/ca_infrastructure/logging/logger');
const records = [];
class CaptureTransport extends Transport {
  log(info, callback) {
    records.push(JSON.parse(JSON.stringify(info)));
    callback();
  }
}
logger.clear();
logger.add(new CaptureTransport());

function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

// Keep the real app's middleware order, but replace authenticated/database routes
// with synthetic handlers so the checks do not depend on MongoDB or Redis.
stubModule('../src/ca_infrastructure/authentication/authentication', {
  PassportConfig: class {
    initialize() { return (_req, _res, next) => next(); }
  },
});
for (const resource of ['product', 'customer', 'order', 'user']) {
  const router = express.Router();
  router.get('/:id', (_req, res) => res.json({ ok: true }));
  router.post('/', (_req, res) => res.status(201).json({ ok: true }));
  stubModule(`../src/ca_presentation/routes/${resource}routes`, { __esModule: true, default: router });
}
const app = require('../src/app').default;

// Exercise Express with real HTTP request/response objects over an in-memory
// stream. This also works in sandboxes that prohibit localhost connections.
async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  socket.remoteAddress = '127.0.0.1';
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = path;
  req.headers = { host: 'localhost', ...headers };
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) {
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = String(Buffer.byteLength(payload));
  }
  const res = new ServerResponse(req);
  const chunks = [];
  const originalEnd = res.end;
  res.end = function(chunk, ...args) {
    if (chunk !== undefined && chunk !== null) chunks.push(Buffer.from(chunk));
    return originalEnd.call(this, chunk, ...args);
  };
  res.assignSocket(socket);
  const finished = once(res, 'finish');
  app.handle(req, res);
  if (payload !== undefined) req.push(payload);
  req.complete = true;
  req.push(null);
  await finished;
  socket.destroy();
  return { status: res.statusCode, headers: res.getHeaders(), body: Buffer.concat(chunks).toString() };
}

test('request logs omit credentials, IDs and query values and correlate with the response', { timeout: 5000 }, async () => {
  const response = await request('/api/product/private-id?token=PRIVATE_QUERY', {
    headers: { authorization: 'Bearer PRIVATE_BEARER', cookie: 'session=PRIVATE_COOKIE' },
  });
  assert.equal(response.status, 200);
  const record = records.at(-1);
  assert.equal(record.route, '/api/product/:id');
  assert.equal(record.statusCode, 200);
  assert.equal(record.requestId, response.headers['x-request-id']);
  assert.match(record.requestId, /^[a-f0-9-]{36}$/);
  assert.ok(record.durationMs >= 0);

  await request('/api/user', { method: 'POST', body: { password: 'PRIVATE_PASSWORD', email: 'PRIVATE_EMAIL' } });
  const serialized = JSON.stringify(records);
  for (const secret of ['private-id', 'PRIVATE_QUERY', 'PRIVATE_BEARER', 'PRIVATE_COOKIE', 'PRIVATE_PASSWORD', 'PRIVATE_EMAIL']) {
    assert.ok(!serialized.includes(secret), `Request logs leaked ${secret}`);
  }
});

test('different IDs and query strings share one metric route; 404 paths are bounded', { timeout: 5000 }, async () => {
  await request('/api/product/another-id?q=ANOTHER_QUERY');
  await request('/missing-one');
  await request('/missing-two');
  const response = await request('/metrics');
  assert.equal(response.status, 200);
  const counts = response.body.split('\n').filter(line => line.startsWith('http_request_duration_seconds_count'));
  assert.equal(counts.filter(line => line.includes('route="/api/product/:id"')).length, 1);
  assert.ok(counts.some(line => line.includes('route="unmatched",code="404"} 2')));
  assert.ok(!response.body.includes('another-id'));
  assert.ok(!response.body.includes('ANOTHER_QUERY'));
  assert.ok(!response.body.includes('missing-one'));
  assert.ok(!counts.some(line => line.includes('route="/metrics"')));
});

test('rate-limit rejections are observed and do not prevent repeated metrics scrapes', { timeout: 5000 }, async () => {
  let response;
  for (let i = 0; i < 101; i++) response = await request('/api/product/rate-limit-example');
  assert.equal(response.status, 429);
  assert.equal(records.at(-1).statusCode, 429);
  assert.equal(records.at(-1).level, 'warn');
  const recordCount = records.length;
  for (let i = 0; i < 101; i++) {
    const scrape = await request('/metrics');
    assert.equal(scrape.status, 200);
    assert.ok(scrape.body.includes('code="429"'));
  }
  assert.equal(records.length, recordCount, 'Scrapes should not produce request logs');
});

test('disabled Loki uses only console logging', () => {
  const consoleLogger = createAppLogger({ LOKI_ENABLED: 'false' });
  assert.equal(consoleLogger.transports.length, 1);
  assert.equal(consoleLogger.transports[0].constructor.name, 'Console');
  consoleLogger.close();
});

test('successful login does not print the password or user record', async () => {
  const bcrypt = require('bcrypt');
  const password = 'SYNTHETIC_LOGIN_PASSWORD';
  const user = {
    userId: 'synthetic-user',
    email: 'synthetic@example.com',
    password: await bcrypt.hash(password, 4),
  };
  stubModule('../src/ca_infrastructure/database/repositories/userrepository', {
    UserRepository: class { async findByEmail() { return user; } },
  });
  stubModule('../src/ca_infrastructure/database/redis/redis', {
    __esModule: true,
    default: { async set() { return 'OK'; } },
  });
  process.env.SECRET_KEY = 'synthetic-monitoring-test-signing-secret';
  const { LoginUsecase } = require('../src/ca_application/usecases/login_usecase');
  const printed = [];
  const originalLog = console.log;
  console.log = (...args) => printed.push(args);
  try {
    const result = await new LoginUsecase().execute(user.email, password);
    assert.ok(result.token);
    assert.ok(result.refreshToken);
    const jwt = require('jsonwebtoken');
    assert.equal(jwt.verify(result.token, process.env.SECRET_KEY)._id, user.userId);
    assert.equal(jwt.verify(result.refreshToken, process.env.SECRET_KEY)._id, user.userId);
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(printed, []);
});

after(() => logger.close());
