import { redis, whoami } from '../lib/db.js';
import { savePush, removePush } from '../lib/push.js';

export default async (req, res) => {
  if (req.method === 'GET') {   // fichiers likés par cet utilisateur (pour l'état ❤ au chargement)
    const v = String(req.query.v || '').trim().toLowerCase();
    if (!v) return res.json([]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json((await redis.smembers('ulikes:' + v)) || []);
  }
  if (req.query.k === 'pushkey') {   // clé publique VAPID nécessaire au navigateur pour s'abonner (rien de secret ici)
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(500).json({ error: 'Push not configured' });
    return res.json({ key: process.env.VAPID_PUBLIC_KEY });
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (req.query.k === 'push') {   // abonnement / désabonnement aux notifications du navigateur, lié au compte connecté
    const me = await whoami(req);
    if (!me) return res.status(401).json({ error: 'Please log in to enable notifications' });
    const b = req.body || {};
    if (b.sub) { await savePush(me, b.sub); return res.json({ ok: true }); }
    if (b.unsub) { await removePush(me); return res.json({ ok: true }); }
    return res.status(400).json({ error: 'Missing sub or unsub' });
  }
  if (req.query.k === 'view') {   // vue d'un APK : 1 par compte
    const me = await whoami(req), vid = String(req.body?.id || '');
    if (!me || !vid || !await redis.hexists('items', vid)) return res.status(400).json({ error: 'Invalid request' });
    if (await redis.sadd('av:' + vid, me)) await redis.hincrby('views', vid, 1);
    return res.json({ ok: true, n: Number(await redis.hget('views', vid)) || 0 });
  }
  const id = String(req.body?.id || ''), v = String(req.body?.v || '').trim().toLowerCase(), on = !!req.body?.on;
  if (!id || !v || !await redis.hexists('items', id)) return res.status(400).json({ error: 'Invalid request' });
  const already = await redis.sismember('ulikes:' + v, id);
  if (on && !already) {
    await Promise.all([redis.sadd('lk:' + id, v), redis.sadd('ulikes:' + v, id), redis.hincrby('likes', id, 1)]);
  } else if (!on && already) {
    await Promise.all([redis.srem('lk:' + id, v), redis.srem('ulikes:' + v, id), redis.hincrby('likes', id, -1)]);
  }
  const n = Math.max(0, Number(await redis.hget('likes', id)) || 0);
  res.json({ ok: true, n });
};
