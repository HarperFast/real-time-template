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
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;
const fixtureDir = resolve(__dirname, '..');

// harper's `exports` map only exposes ".", so the harness's default resolution of
// 'harper/dist/bin/harper.js' throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the CLI
// from the exported package root and pass it explicitly as harperBinPath.
const harperBinPath = resolve(dirname(require.resolve('harper')), 'bin/harper.js');

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

suite('Topic CRUD', (ctx: ContextWithHarper) => {
  before(async () => {
    await setupHarperWithFixture(ctx, fixtureDir, { harperBinPath });
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

    ok(res.ok, `POST /Topic/ should succeed, got HTTP ${res.status}`);
    // Harper v5 POST returns the id in the Location header; verify fields via GET.
    const location = res.headers.get('location');
    ok(location, 'response should include a Location header with the new id');
    const id = location!.split('/').pop();
    ok(id, 'Location header should contain the new record id');

    const getRes = await fetch(`${httpURL}/Topic/${id}`, { headers: { Authorization: auth } });
    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { name: string; category: string };
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
    ok(createRes.ok, `POST should succeed, got HTTP ${createRes.status}`);
    // Harper v5: id is in Location header, not response body
    const location = createRes.headers.get('location');
    const id = location!.split('/').pop()!;

    const getRes = await fetch(`${httpURL}/Topic/${id}`, {
      headers: { Authorization: auth },
    });

    strictEqual(getRes.status, 200);
    const body = await getRes.json() as { id: string; name: string; category: string };
    strictEqual(body.id, id);
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
    ok(createRes.ok, `POST should succeed, got HTTP ${createRes.status}`);
    // Harper v5: id is in Location header
    const location = createRes.headers.get('location');
    const id = location!.split('/').pop()!;

    const updateRes = await fetch(`${httpURL}/Topic/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'After Update', category: 'update-test' }),
    });
    ok(updateRes.ok, `expected successful update, got HTTP ${updateRes.status}`);

    const getRes = await fetch(`${httpURL}/Topic/${id}`, {
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
    ok(createRes.ok, `POST should succeed, got HTTP ${createRes.status}`);
    // Harper v5: id is in Location header
    const location = createRes.headers.get('location');
    const id = location!.split('/').pop()!;

    const deleteRes = await fetch(`${httpURL}/Topic/${id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    ok(deleteRes.ok, `expected successful delete, got HTTP ${deleteRes.status}`);

    const getRes = await fetch(`${httpURL}/Topic/${id}`, {
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

  test('GET /GetAll returns an array of topics', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    // Create a topic so the list is non-empty
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
  });

  test('GET /GetAll with invalid credentials returns 401', async () => {
    const { httpURL } = ctx.harper;
    // authorizeLocal is true in the test environment, so unauthenticated local
    // requests are permitted. Use invalid credentials to verify auth is enforced.
    const res = await fetch(`${httpURL}/GetAll`, {
      headers: { Authorization: 'Basic ' + Buffer.from('bad:credentials').toString('base64') },
    });
    strictEqual(res.status, 401);
  });
});
