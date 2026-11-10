import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import {
  body,
  guardOrigin,
  token,
  visitor,
  getSession,
  saveSession,
  claimAttempt,
} from '../lib/shared.js';
import { inventory } from '../lib/domain.js';

process.env.FRIDGEOPS_SESSION_SECRET = 'test-only-signing-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const owner = 'b67fe4a1-5371-46db-b74d-92d4f0300500';

test('rejects primitive JSON and oversized requests with client errors', async () => {
  for (const value of ['null', '[]', '"text"', '42', '{']) {
    await assert.rejects(body(Readable.from([Buffer.from(value)])), {
      status: 400,
    });
  }
  await assert.rejects(body(Readable.from([Buffer.from('{"x":123}')]), 3), {
    status: 413,
  });
  assert.deepEqual(await body(Readable.from([Buffer.from('{"x":1}')])), {
    x: 1,
  });
});

test('malformed and tampered cookies fail closed without throwing', () => {
  const valid = token(owner);
  assert.equal(
    visitor({ headers: { cookie: `fridgeops_session=${valid}` } }),
    owner,
  );
  for (const value of [
    valid + '.extra',
    valid.split('.')[0] + '.' + 'é'.repeat(43),
    'broken',
  ]) {
    assert.equal(
      visitor({ headers: { cookie: `fridgeops_session=${value}` } }),
      null,
    );
  }
  const signature = valid.split('.')[1];
  const tampered = `${valid.split('.')[0]}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.equal(
    visitor({ headers: { cookie: `fridgeops_session=${tampered}` } }),
    null,
  );
});

test('rejects foreign origins and null inventory rows', () => {
  assert.throws(
    () =>
      guardOrigin({
        headers: { host: 'app.example', origin: 'https://evil.example' },
      }),
    { status: 403 },
  );
  assert.doesNotThrow(() =>
    guardOrigin({
      headers: { host: 'app.example', origin: 'https://app.example' },
    }),
  );
  assert.throws(() => inventory([null]), { status: 400 });
});

test('session reads bind ownership and writes reject stale revisions', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url: new URL(url), options });
    return new Response('[]', { status: 200 });
  };
  try {
    await assert.rejects(getSession(owner, owner), { status: 404 });
    assert.equal(seen[0].url.searchParams.get('visitor_id'), `eq.${owner}`);
    await assert.rejects(saveSession({ id: owner, revision: 7 }, owner, {}), {
      status: 409,
    });
    assert.equal(seen[1].url.searchParams.get('revision'), 'eq.7');
    assert.equal(seen[1].url.searchParams.get('visitor_id'), `eq.${owner}`);
    assert.equal(JSON.parse(seen[1].options.body).revision, 8);
  } finally {
    globalThis.fetch = original;
  }
});

test('quota rejection prevents provider admission', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /rpc\/fridgeops_claim_attempt$/);
    assert.equal(JSON.parse(options.body).p_visitor, owner);
    return new Response('false', { status: 200 });
  };
  try {
    await assert.rejects(claimAttempt(owner), { status: 429 });
  } finally {
    globalThis.fetch = original;
  }
});
