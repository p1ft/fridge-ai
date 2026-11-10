import {
  body,
  fail,
  getSession,
  guardOrigin,
  handleError,
  reply,
  requireVisitor,
  saveSession,
  supabase,
  uuid,
} from '../lib/shared.js';
import { inventory } from '../lib/domain.js';

export default async function handler(req, res) {
  try {
    const owner = requireVisitor(req);
    if (req.method !== 'GET') guardOrigin(req);
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const id = url.searchParams.get('id');
    if (req.method === 'GET') {
      if (id) return reply(res, 200, { session: await getSession(id, owner) });
      const rows = await supabase(
        `fridgeops_web_sessions?select=id,revision,state,created_at,updated_at&visitor_id=eq.${owner}&order=updated_at.desc&limit=25`,
      );
      return reply(res, 200, { sessions: rows });
    }
    if (req.method === 'POST') {
      const state = {
        title: `Session ${new Date().toLocaleDateString('en-US')}`,
        inventory: [],
        recipes: [],
        source: null,
        warning: '',
      };
      const rows = await supabase('fridgeops_web_sessions?select=*', {
        method: 'POST',
        data: { id: uuid(), visitor_id: owner, state },
        prefer: 'return=representation',
      });
      return reply(res, 201, { session: rows[0] });
    }
    if (req.method === 'PATCH') {
      const input = await body(req, 30_000);
      const session = await getSession(input.id, owner);
      if (session.revision !== input.revision)
        return fail(res, 409, 'This session changed. Refresh the page.');
      const state = {
        ...session.state,
        title: String(input.title || session.state.title || 'My session')
          .trim()
          .slice(0, 80),
        inventory: inventory(input.inventory),
        recipes: [],
        source: null,
        warning: '',
      };
      return reply(res, 200, {
        session: await saveSession(session, owner, state),
      });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (error) {
    handleError(res, error);
  }
}
