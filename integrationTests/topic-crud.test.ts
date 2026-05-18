/**
 * Verifies CRUD operations on the Topic REST API and the GetAll custom route.
 * Each test creates its own data and cleans up, so tests are independent and can
 * run in any order.
 */
import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, '..');

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

suite('Topic CRUD', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir);
  });

  after(async () => {
    await teardownHarper(ctx);
  });

  test('POST /Topic creates a topic and returns it with an id', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'Integration Test Topic', category: 'test' }),
    });

    strictEqual(res.status, 200);
    const body = await res.json() as { id: string; name: string; category: string };
    ok(body.id, 'response should include an id');
    strictEqual(body.name, 'Integration Test Topic');
    strictEqual(body.category, 'test');
  });

  test('GET /Topic/:id returns the topic by id', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const createRes = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'Read Me', category: 'read-test' }),
    });
    const created = await createRes.json() as { id: string; name: string; category: string };

    const getRes = await fetch(`${httpURL}/Topic/${created.id}`, {
      headers: { Authorization: auth },
    });

    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { id: string; name: string; category: string };
    strictEqual(body.id, created.id);
    strictEqual(body.name, 'Read Me');
    strictEqual(body.category, 'read-test');
  });

  test('PUT /Topic/:id updates the topic', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const createRes = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'Before Update', category: 'update-test' }),
    });
    const created = await createRes.json() as { id: string };

    const updateRes = await fetch(`${httpURL}/Topic/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'After Update', category: 'update-test' }),
    });
    ok(updateRes.ok, `expected successful update, got HTTP ${updateRes.status}`);

    const getRes = await fetch(`${httpURL}/Topic/${created.id}`, {
      headers: { Authorization: auth },
    });
    const body = await getRes.json() as { name: string };
    strictEqual(body.name, 'After Update');
  });

  test('DELETE /Topic/:id removes the topic', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const createRes = await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'Delete Me', category: 'delete-test' }),
    });
    const created = await createRes.json() as { id: string };

    const deleteRes = await fetch(`${httpURL}/Topic/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    ok(deleteRes.ok, `expected successful delete, got HTTP ${deleteRes.status}`);

    const getRes = await fetch(`${httpURL}/Topic/${created.id}`, {
      headers: { Authorization: auth },
    });
    strictEqual(getRes.status, 404);
  });

  test('GET /Topic lists topics', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    for (const name of ['List Topic A', 'List Topic B']) {
      await fetch(`${httpURL}/Topic/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name, category: 'list-test' }),
      });
    }

    const res = await fetch(`${httpURL}/Topic/`, {
      headers: { Authorization: auth },
    });

    strictEqual(res.status, 200);
    const body = await res.json();
    ok(Array.isArray(body), 'GET /Topic should return an array');
    ok((body as unknown[]).length >= 2, 'should have at least 2 topics');
  });

  test('GET /Topic/:id returns 404 for a non-existent id', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    const res = await fetch(`${httpURL}/Topic/does-not-exist-99999`, {
      headers: { Authorization: auth },
    });

    strictEqual(res.status, 404);
  });
});

suite('GetAll custom route', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir);
  });

  after(async () => {
    await teardownHarper(ctx);
  });

  test('GET /GetAll returns an array of all topics', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'GetAll Topic', category: 'getall-test' }),
    });

    const res = await fetch(`${httpURL}/GetAll`, {
      headers: { Authorization: auth },
    });

    strictEqual(res.status, 200);
    const body = await res.json();
    ok(Array.isArray(body), 'GET /GetAll should return an array');
    ok((body as unknown[]).length >= 1, 'should include the created topic');
  });

  test('GET /GetAll without auth returns 401', async () => {
    const { httpURL } = ctx.harper;

    const res = await fetch(`${httpURL}/GetAll`);

    strictEqual(res.status, 401);
  });
});
