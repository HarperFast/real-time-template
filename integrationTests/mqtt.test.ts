/**
 * Verifies the real-time MQTT transport for the Topic resource, over both the
 * native MQTT TCP port (1883) and MQTT-over-WebSocket on the HTTP port.
 *
 * The Topic table is exported with @export, so each table record maps to an MQTT
 * topic of the form `Topic/<id>`. Writing a record (REST PUT) publishes a retained
 * message that MQTT subscribers receive in real time. This exercises the same
 * pub/sub path the bundled mqtt_client.js demonstrates.
 */
import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { connectAsync, type MqttClient } from 'mqtt';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, '..');

// harper's `exports` map only exposes ".", so the harness's default resolution of
// 'harper/dist/bin/harper.js' throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the CLI
// from the exported package root and pass it explicitly as harperBinPath.
const harperBinPath = resolve(dirname(require.resolve('harper')), 'bin/harper.js');

// Default MQTT TCP port used by the integration-testing harness.
const MQTT_PORT = 1883;

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

/** Wait for the first message on `topicFilter`, or reject after `timeoutMs`. */
function waitForMessage(
  client: MqttClient,
  topicFilter: string,
  timeoutMs = 15_000,
): Promise<{ topic: string; payload: string }> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      client.removeListener('message', onMessage);
      reject(new Error(`timed out after ${timeoutMs}ms waiting for a message on ${topicFilter}`));
    }, timeoutMs);

    function onMessage(topic: string, payload: Buffer) {
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      resolvePromise({ topic, payload: payload.toString() });
    }
    client.on('message', onMessage);
  });
}

suite('MQTT real-time transport', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir, { harperBinPath });
    // Real-time subscriptions on a table are only initialized after the first
    // write, so prime the table before subscribing.
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: '_warmup', category: '_warmup' }),
    });
  });

  after(async () => {
    await teardownHarper(ctx);
  });

  test('subscriber over native MQTT (1883) receives a message when a topic is written', async () => {
    const { admin, hostname } = ctx.harper;
    const id = `mqtt-tcp-${Date.now()}`;

    const client = await connectAsync(`mqtt://${hostname}:${MQTT_PORT}`, {
      username: admin.username,
      password: admin.password,
      protocolVersion: 5,
    });

    try {
      await client.subscribeAsync(`Topic/${id}`, { qos: 1 });
      const messagePromise = waitForMessage(client, `Topic/${id}`);

      // Trigger a publish by writing the record via REST (PUT to a specific id).
      const auth = basicAuth(admin.username, admin.password);
      const putRes = await fetch(`${ctx.harper.httpURL}/Topic/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name: 'MQTT TCP message', category: 'mqtt-tcp' }),
      });
      ok(putRes.ok, `PUT /Topic/${id} should succeed, got HTTP ${putRes.status}`);

      const { topic, payload } = await messagePromise;
      strictEqual(topic, `Topic/${id}`);
      const data = JSON.parse(payload) as { name: string; category: string };
      strictEqual(data.name, 'MQTT TCP message');
      strictEqual(data.category, 'mqtt-tcp');
    } finally {
      await client.endAsync(true);
    }
  });

  test('subscriber over MQTT-via-WebSocket receives a message when a topic is written', async () => {
    const { admin, hostname, httpURL } = ctx.harper;
    const id = `mqtt-ws-${Date.now()}`;

    // Harper serves MQTT over WebSocket on the HTTP port at the /mqtt path.
    const wsURL = `ws://${hostname}:${new URL(httpURL).port}/mqtt`;
    const client = await connectAsync(wsURL, {
      username: admin.username,
      password: admin.password,
      protocolVersion: 5,
    });

    try {
      await client.subscribeAsync(`Topic/${id}`, { qos: 1 });
      const messagePromise = waitForMessage(client, `Topic/${id}`);

      const auth = basicAuth(admin.username, admin.password);
      const putRes = await fetch(`${httpURL}/Topic/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name: 'MQTT WS message', category: 'mqtt-ws' }),
      });
      ok(putRes.ok, `PUT /Topic/${id} should succeed, got HTTP ${putRes.status}`);

      const { topic, payload } = await messagePromise;
      strictEqual(topic, `Topic/${id}`);
      const data = JSON.parse(payload) as { name: string; category: string };
      strictEqual(data.name, 'MQTT WS message');
      strictEqual(data.category, 'mqtt-ws');
    } finally {
      await client.endAsync(true);
    }
  });
});
