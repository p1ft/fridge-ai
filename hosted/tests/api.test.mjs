import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import auth from '../api/auth.js';
import sessions from '../api/sessions.js';
import recipeHandler from '../api/recipes.js';
import vision from '../api/vision.js';

process.env.FRIDGEOPS_WEB_ACCESS_CODE = 'test-access-code';
process.env.FRIDGEOPS_SESSION_SECRET =
  'test-secret-long-enough-for-hmac-123456';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.GEMINI_API_KEY = 'test';

function request(method, url, payload, cookie) {
  const req = Readable.from(
    payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))],
  );
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000', ...(cookie ? { cookie } : {}) };
  return req;
}
async function invoke(handler, method, url, payload, cookie) {
  const res = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(raw) {
      this.body = JSON.parse(raw);
    },
  };
  await handler(request(method, url, payload, cookie), res);
  return res;
}

test('auth signs an HttpOnly cookie; wrong code is rejected', async () => {
  const bad = await invoke(auth, 'POST', '/api/auth', { code: 'wrong' });
  assert.equal(bad.status, 401);
  const ok = await invoke(auth, 'POST', '/api/auth', {
    code: 'test-access-code',
  });
  assert.equal(ok.status, 200);
  assert.match(ok.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  const cookie = ok.headers['Set-Cookie'].split(';')[0];
  const check = await invoke(auth, 'GET', '/api/auth', undefined, cookie);
  assert.equal(check.body.authenticated, true);
});

test('public demo creates an isolated signed visitor session', async () => {
  const oldCode = process.env.FRIDGEOPS_WEB_ACCESS_CODE,
    oldSecret = process.env.FRIDGEOPS_SESSION_SECRET;
  delete process.env.FRIDGEOPS_WEB_ACCESS_CODE;
  delete process.env.FRIDGEOPS_SESSION_SECRET;
  try {
    const first = await invoke(auth, 'GET', '/api/auth');
    assert.equal(first.body.authenticated, true);
    assert.equal(first.body.protected, false);
    const check = await invoke(
      auth,
      'GET',
      '/api/auth',
      undefined,
      first.headers['Set-Cookie'].split(';')[0],
    );
    assert.equal(check.body.authenticated, true);
    assert.equal(check.headers['Set-Cookie'], undefined);
  } finally {
    process.env.FRIDGEOPS_WEB_ACCESS_CODE = oldCode;
    process.env.FRIDGEOPS_SESSION_SECRET = oldSecret;
  }
});

test('sessions and fallback recipes work with server-only Supabase key', async () => {
  const cookie = (
    await invoke(auth, 'POST', '/api/auth', { code: 'test-access-code' })
  ).headers['Set-Cookie'].split(';')[0];
  const id = 'b67fe4a1-5371-46db-b74d-92d4f0300500';
  const owner = JSON.parse(
    Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url'),
  ).v;
  let state = { title: 'Test', inventory: [], recipes: [] };
  let revision = 1;
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ url, headers: options.headers });
    assert.equal(options.headers.apikey, 'sb_secret_test');
    assert.equal(options.headers.Authorization, undefined);
    const u = new URL(url);
    if (
      u.pathname.endsWith('/fridgeops_web_sessions') &&
      options.method === 'POST'
    )
      return new Response(
        JSON.stringify([{ id, visitor_id: owner, state, revision }]),
        { status: 201 },
      );
    if (
      u.pathname.endsWith('/fridgeops_web_sessions') &&
      options.method === 'PATCH'
    ) {
      state = JSON.parse(options.body).state;
      revision++;
      return new Response(
        JSON.stringify([{ id, visitor_id: owner, state, revision }]),
        { status: 200 },
      );
    }
    if (u.pathname.endsWith('/fridgeops_web_sessions'))
      return new Response(
        JSON.stringify([{ id, visitor_id: owner, state, revision }]),
        { status: 200 },
      );
    if (u.pathname.endsWith('/rpc/fridgeops_claim_attempt'))
      return new Response('false', { status: 200 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const created = await invoke(sessions, 'POST', '/api/sessions', {}, cookie);
    assert.equal(created.status, 201);
    const saved = await invoke(
      sessions,
      'PATCH',
      '/api/sessions',
      {
        id,
        revision: 1,
        inventory: [{ id: 'egg', name: 'eggs', quantity: 2, unit: 'piece' }],
      },
      cookie,
    );
    assert.equal(saved.status, 200);
    const cooked = await invoke(
      recipeHandler,
      'POST',
      '/api/recipes',
      { id, revision: 2, servings: 2 },
      cookie,
    );
    assert.equal(cooked.status, 200);
    assert.equal(cooked.body.session.state.source, 'fallback');
    assert.equal(
      cooked.body.session.state.recipes[0].nutrition.per_serving.kcal,
      71.5,
    );
    assert.ok(seen.length >= 4);
  } finally {
    globalThis.fetch = original;
  }
});

test('vision accepts a bounded image and returns a reviewable draft without storing photos', async () => {
  const cookie = (
    await invoke(auth, 'POST', '/api/auth', { code: 'test-access-code' })
  ).headers['Set-Cookie'].split(';')[0];
  const bytes = Buffer.alloc(128);
  bytes.set([0xff, 0xd8, 0xff]);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    if (String(url).endsWith('/rpc/fridgeops_claim_attempt'))
      return new Response('true', { status: 200 });
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(
      JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType,
      'image/jpeg',
    );
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [{ name: 'tomatoes', quantity: 2, unit: 'piece' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const result = await invoke(
      vision,
      'POST',
      '/api/vision',
      { images: [{ mimeType: 'image/jpeg', data: bytes.toString('base64') }] },
      cookie,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.items[0].name, 'tomatoes');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
