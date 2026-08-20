/**
 * Verifies CRUD operations on the Topic REST API and the TopicList custom route.
 * Each test creates its own data and cleans up, so tests are independent and can
 * run in any order.
 */
import { suite, test, before, after } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';
import { setupHarperWithFixture, teardownHarper, type ContextWithHarper } from '@harperfast/integration-testing';
import { resolve } from 'node:path';
import { basicAuth, harperBinPath } from './helpers.ts';

const __dirname = import.meta.dirname;
const fixtureDir = resolve(__dirname, '..');

// Mirrors MAX_LIMIT in routes/index.js: the cap TopicList enforces on its result set.
// Not imported, because routes/index.js imports 'harper', which only resolves inside the server.
const TOPIC_LIST_MAX_LIMIT = 100;

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
    const id = location.split('/').pop();
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
    ok(location, 'response should include a Location header with the new id');
    const id = location.split('/').pop();
    ok(id, 'Location header should contain the new record id');

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
    ok(location, 'response should include a Location header with the new id');
    const id = location.split('/').pop();
    ok(id, 'Location header should contain the new record id');

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
    ok(location, 'response should include a Location header with the new id');
    const id = location.split('/').pop();
    ok(id, 'Location header should contain the new record id');

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

  test('GET /TopicList returns an array of topics', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    // Create a topic so the list is non-empty
    await fetch(`${httpURL}/Topic/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: 'TopicList Topic', category: 'topiclist-test' }),
    });

    const res = await fetch(`${httpURL}/TopicList`, {
      headers: { Authorization: auth },
    });

    strictEqual(res.status, 200);
    const body = await res.json();
    ok(Array.isArray(body), 'GET /TopicList should return an array');
  });

  test('GET /TopicList bounds the result set regardless of the requested limit', async () => {
    const { admin, httpURL } = ctx.harper;
    const auth = basicAuth(admin.username, admin.password);

    // Seed past the cap so an unenforced limit would come back larger than MAX_LIMIT.
    const seeds = Array.from({ length: TOPIC_LIST_MAX_LIMIT + 1 }, (_, i) =>
      fetch(`${httpURL}/Topic/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name: `Limit Cap ${i}`, category: 'limit-cap-test' }),
      }),
    );
    for (const seedRes of await Promise.all(seeds)) {
      ok(seedRes.ok, `seed POST /Topic/ should succeed, got HTTP ${seedRes.status}`);
    }

    const listLength = async (query: string): Promise<number> => {
      const res = await fetch(`${httpURL}/TopicList${query}`, { headers: { Authorization: auth } });
      strictEqual(res.status, 200, `GET /TopicList${query} should succeed`);
      const body = await res.json() as unknown[];
      ok(Array.isArray(body), `GET /TopicList${query} should return an array`);
      return body.length;
    };

    // Harper's query syntax for a page size is the `limit(n)` function form; `?limit=n` is
    // parsed as an attribute filter and never reaches the resource.
    //
    // A limit above the maximum is clamped, not honored — otherwise a single request can
    // materialize the whole table, the hazard the resource exists to prevent. The seed above
    // puts more than MAX_LIMIT rows in the table, so an unclamped limit would exceed it.
    strictEqual(await listLength('?limit(1000000000)'), TOPIC_LIST_MAX_LIMIT, 'a limit above the max must be clamped');

    // A non-numeric limit parses to NaN, and NaN as a slice end disables the bound entirely
    // (`i >= NaN` is always false), so it must fall back to the maximum rather than pass through.
    strictEqual(await listLength('?limit(abc)'), TOPIC_LIST_MAX_LIMIT, 'a non-numeric limit must fall back to the max');

    // No limit at all also uses the maximum.
    strictEqual(await listLength(''), TOPIC_LIST_MAX_LIMIT, 'an absent limit must use the max as the page size');

    // A limit under the maximum is honored as-is.
    strictEqual(await listLength('?limit(5)'), 5, 'a limit under the max should be honored');
  });

  test('GET /TopicList with invalid credentials returns 401', async () => {
    const { httpURL } = ctx.harper;
    // authorizeLocal is true in the test environment, so unauthenticated local
    // requests are permitted. Use invalid credentials to verify auth is enforced.
    const res = await fetch(`${httpURL}/TopicList`, {
      headers: { Authorization: 'Basic ' + Buffer.from('bad:credentials').toString('base64') },
    });
    strictEqual(res.status, 401);
  });
});
