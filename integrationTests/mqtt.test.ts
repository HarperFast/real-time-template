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
import { resolve } from 'node:path';
import { connectAsync, type MqttClient } from 'mqtt';
import { basicAuth, harperBinPath } from './helpers.ts';

const __dirname = import.meta.dirname;
const fixtureDir = resolve(__dirname, '..');

// Default MQTT TCP port. The integration-testing harness isolates each Harper instance by
// assigning it its own loopback IP (ctx.harper.hostname), not by remapping fixed ports, and
// HarperContext exposes no MQTT port field — so the default 1883 on a per-instance hostname is
// correct and collision-free for parallel runs.
const MQTT_PORT = 1883;

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
      // Only resolve for the topic we subscribed to. `message` fires for every message
      // the client receives, so without this guard a retained/warmup message on another
      // topic (or a parallel run) could resolve the promise with the wrong payload.
      if (topic !== topicFilter) return;
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
