import crypto from 'node:crypto';

export function reply(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function fail(res, status, message) {
  reply(res, status, { error: message });
}

export async function body(req, limit = 4_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Expected object');
    return value;
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

export function guardOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (
    new URL(origin).host !== host ||
    (new URL(origin).protocol !== 'https:' &&
      process.env.NODE_ENV === 'production')
  )
    throw Object.assign(new Error('Request origin is not allowed.'), {
      status: 403,
    });
}

export function uuid() {
  return crypto.randomUUID();
}
export function validUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function secret() {
  if (process.env.FRIDGEOPS_SESSION_SECRET)
    return process.env.FRIDGEOPS_SESSION_SECRET;
  if (!process.env.SUPABASE_SECRET_KEY) return '';
  return crypto.hkdfSync(
    'sha256',
    process.env.SUPABASE_SECRET_KEY,
    'FridgeOps',
    'web-session-v1',
    32,
  );
}
function signature(payload) {
  return crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
}
export function token(visitorId) {
  const payload = Buffer.from(
    JSON.stringify({ v: visitorId, exp: Date.now() + 7 * 86400_000 }),
  ).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function visitor(req) {
  if (!secret()) return null;
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('fridgeops_session='));
  const value = cookie?.slice('fridgeops_session='.length) || '';
  const [payload, sig, extra] = value.split('.');
  if (
    !payload ||
    !sig ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]{43}$/.test(sig)
  )
    return null;
  const expected = signature(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return p.exp > Date.now() && validUuid(p.v) ? p.v : null;
  } catch {
    return null;
  }
}
export function requireVisitor(req) {
  const id = visitor(req);
  if (!id)
    throw Object.assign(new Error('Authentication required.'), { status: 401 });
  return id;
}
export function cookie(value, req) {
  const secure =
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  return `fridgeops_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 604800 : 0}${secure ? '; Secure' : ''}`;
}
export function configured() {
  return ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GEMINI_API_KEY'].every(
    (k) => !!process.env[k],
  );
}

export async function supabase(path, { method = 'GET', data, prefer } = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key)
    throw Object.assign(new Error('Database is not configured.'), {
      status: 503,
    });
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error('Supabase request failed:', response.status);
    throw Object.assign(new Error('Database request failed.'), { status: 502 });
  }
  return raw ? JSON.parse(raw) : null;
}

export async function getSession(id, owner) {
  if (!validUuid(id))
    throw Object.assign(new Error('Invalid session ID.'), { status: 400 });
  const rows = await supabase(
    `fridgeops_web_sessions?select=*&id=eq.${id}&visitor_id=eq.${owner}&limit=1`,
  );
  if (!rows?.length)
    throw Object.assign(new Error('Session not found.'), { status: 404 });
  return rows[0];
}

export async function saveSession(session, owner, state) {
  const rows = await supabase(
    `fridgeops_web_sessions?id=eq.${session.id}&visitor_id=eq.${owner}&revision=eq.${session.revision}&select=*`,
    {
      method: 'PATCH',
      data: {
        state,
        revision: session.revision + 1,
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    },
  );
  if (!rows?.length)
    throw Object.assign(
      new Error('This session changed in another window. Refresh the page.'),
      { status: 409 },
    );
  return rows[0];
}

export async function claimAttempt(owner) {
  const allowed = await supabase('rpc/fridgeops_claim_attempt', {
    method: 'POST',
    data: { p_visitor: owner },
  });
  if (!allowed)
    throw Object.assign(
      new Error(
        'The daily AI limit has been reached. You can continue manually.',
      ),
      { status: 429 },
    );
}

export async function gemini(parts, maxOutputTokens = 1800) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens,
        },
      }),
      signal: AbortSignal.timeout(55000),
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    console.error('Gemini request failed:', response.status);
    throw Object.assign(
      new Error(`AI is temporarily unavailable (${response.status}).`),
      { status: 502 },
    );
  }
  try {
    const payload = JSON.parse(raw);
    const result =
      payload.candidates?.[0]?.content?.parts
        ?.filter((p) => typeof p.text === 'string')
        .map((p) => p.text)
        .join('') || '';
    return JSON.parse(result);
  } catch {
    throw Object.assign(new Error('AI returned an invalid response.'), {
      status: 502,
    });
  }
}

export function handleError(res, error) {
  if ((error.status || 500) >= 500) console.error(error);
  fail(
    res,
    error.status || 500,
    error.status ? error.message : 'Internal error.',
  );
}
