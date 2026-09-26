import { redis, whoami } from '../lib/db.js';
import { savePush, removePush } from '../lib/push.js';

// Abonnement / désabonnement aux notifications push du navigateur, lié au compte connecté.
export default async (req, res) => {
  const me = await whoami(req);
  if (!me) return res.status(401).json({ error: 'Please log in to enable notifications' });

  if (req.method === 'GET' && req.query.k === 'key') {
    // clé publique VAPID nécessaire au navigateur pour s'abonner (rien de secret ici)
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(500).json({ error: 'Push not configured' });
    return res.json({ key: process.env.VAPID_PUBLIC_KEY });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (b.sub) { await savePush(me, b.sub); return res.json({ ok: true }); }
    if (b.unsub) { await removePush(me); return res.json({ ok: true }); }
    return res.status(400).json({ error: 'Missing sub or unsub' });
  }
  return res.status(405).end();
};
