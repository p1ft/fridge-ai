import crypto from 'node:crypto';
import {
  body,
  cookie,
  fail,
  guardOrigin,
  handleError,
  reply,
  token,
  uuid,
  visitor,
} from '../lib/shared.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const protectedDemo = !!process.env.FRIDGEOPS_WEB_ACCESS_CODE;
      if (!process.env.SUPABASE_SECRET_KEY)
        return reply(res, 503, { error: 'Database is not configured.' });
      const existing = visitor(req);
      if (existing || protectedDemo)
        return reply(res, 200, {
          authenticated: !!existing,
          protected: protectedDemo,
        });
      return reply(
        res,
        200,
        { authenticated: true, protected: false },
        { 'Set-Cookie': cookie(token(uuid()), req) },
      );
    }
    guardOrigin(req);
    if (req.method === 'DELETE')
      return reply(
        res,
        200,
        { authenticated: false },
        { 'Set-Cookie': cookie('', req) },
      );
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    const input = await body(req, 1024);
    const expected = process.env.FRIDGEOPS_WEB_ACCESS_CODE || '';
    const entered = String(input?.code || '');
    if (!expected) return fail(res, 400, 'An access code is not required.');
    const a = crypto.createHash('sha256').update(entered).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(a, b))
      return fail(res, 401, 'Incorrect access code.');
    const id = visitor(req) || uuid();
    return reply(
      res,
      200,
      { authenticated: true },
      { 'Set-Cookie': cookie(token(id), req) },
    );
  } catch (error) {
    handleError(res, error);
  }
}
