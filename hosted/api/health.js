import { configured, reply, supabase } from '../lib/shared.js';
export default async function handler(req, res) {
  if (req.method !== 'GET')
    return reply(res, 405, { error: 'Method not allowed' });
  if (!configured())
    return reply(res, 503, {
      ready: false,
      service: 'FridgeOps Web',
      reason: 'configuration',
    });
  try {
    await supabase('fridgeops_web_sessions?select=id&limit=1');
    return reply(res, 200, { ready: true, service: 'FridgeOps Web' });
  } catch {
    return reply(res, 503, {
      ready: false,
      service: 'FridgeOps Web',
      reason: 'database',
    });
  }
}
