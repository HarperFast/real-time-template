/**
 * Verifies real-time Server-Sent Events (SSE) behavior on the Topic resource.
 * The Topic table is exported with @export, so Harper streams live mutations
 * to subscribers via text/event-stream.
 */
import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { resolve } from 'node:path';
import { basicAuth, collectFirstSseEvent, harperBinPath } from './helpers.ts';

const __dirname = import.meta.dirname;
const fixtureDir = resolve(__dirname, '..');

suite('SSE real-time events', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir, { harperBinPath });
    // Warm up the SSE subscription system by writing to the table first.
    // Harper v5 real-time subscriptions on a table are only initialized after
    // the first write, so an SSE connection before any writes will hang indefinitely.
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

  test('GET /Topic with Accept: text/event-stream returns an SSE stream', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    const ac = new AbortController();

    const res = await fetch(`${httpURL}/Topic/`, {
      headers: { Accept: 'text/event-stream', Authorization: auth },
      signal: ac.signal,
    });

    strictEqual(res.status, 200);
    ok(
      res.headers.get('content-type')?.startsWith('text/event-stream'),
      `expected content-type text/event-stream, got ${res.headers.get('content-type')}`,
    );

    ac.abort();
  });

  test('SSE stream delivers a put event when a topic is created', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 15_000);

    const sseRes = await fetch(`${httpURL}/Topic/`, {
      headers: { Accept: 'text/event-stream', Authorization: auth },
      signal: ac.signal,
    });

    strictEqual(sseRes.status, 200);

    const reader = sseRes.body!.getReader();
    const dec = new TextDecoder();

    // Collect stream data until we see a data event or abort fires
    const eventPromise = collectFirstSseEvent(reader, dec, 'put');

    // Trigger a put event by creating a topic
    const postRes = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'SSE Trigger', category: 'sse-test' }),
    });
    ok(postRes.ok, `topic creation failed with HTTP ${postRes.status}`);

    const received = await eventPromise;

    clearTimeout(timeoutId);
    reader.cancel().catch(() => {});

    ok(
      received.includes('event: put\ndata:'),
      `SSE stream should deliver a put event after a topic is created; got: ${received}`,
    );
  });

  test('SSE stream delivers a delete event when a topic is deleted', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 15_000);

    // 1. Open the SSE stream and start the reader loop FIRST. If we created/deleted the
    // record before the reader was looping, the DELETE event could be emitted and missed,
    // making the test hang for 15s or pass vacuously off the initial snapshot.
    const sseRes = await fetch(`${httpURL}/Topic/`, {
      headers: { Accept: 'text/event-stream', Authorization: auth },
      signal: ac.signal,
    });

    strictEqual(sseRes.status, 200);

    const reader = sseRes.body!.getReader();
    const dec = new TextDecoder();

    const eventPromise = collectFirstSseEvent(reader, dec, 'delete');

    // 2. Now create the topic that will be deleted, then immediately delete it.
    const createRes = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'Delete SSE', category: 'sse-delete-test' }),
    });
    ok(createRes.ok, `topic creation failed with HTTP ${createRes.status}`);
    // Harper v5: id is in Location header, not response body
    const createdLocation = createRes.headers.get('location');
    const createdId = createdLocation!.split('/').pop()!;

    const deleteRes = await fetch(`${httpURL}/Topic/${createdId}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    ok(deleteRes.ok, `topic deletion failed with HTTP ${deleteRes.status}`);

    // 3. Await the event delivered on the already-open stream.
    const received = await eventPromise;

    clearTimeout(timeoutId);
    reader.cancel().catch(() => {});

    ok(
      received.includes('event: delete\ndata:'),
      `SSE stream should deliver a delete event after a topic is deleted; got: ${received}`,
    );
  });
});
