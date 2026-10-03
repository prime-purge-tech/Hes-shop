import { Readable } from 'node:stream';
import { redis, tg, whoami, limit } from '../lib/db.js';
import { savePush, removePush } from '../lib/push.js';
export const config = { maxDuration: 60 };

/* ===== TUTOS (regroupés ici pour rester sous la limite de 12 fonctions du plan Hobby de Vercel) ===== */
const TK = ['tlist', 'tvideo', 'tcover', 'tcm', 'tlike', 'tview'];
const fileUrl = async fid => {
  const g = await tg('getFile', { file_id: fid });
  return g.ok ? `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}` : null;
};

async function tutos(req, res, k) {
  const id = String(req.query.id || '');
  if (req.method === 'GET') {
    if (k === 'tvideo' || k === 'tcover') {   // vidéo (avec Range pour avancer / reculer) ou couverture
      const t = await redis.hget('tutos', id);
      if (!t) return res.status(404).end();
      const u = await fileUrl(k === 'tvideo' ? t.video : t.cover);
      if (!u) return res.status(404).end();
      const h = {};
      if (req.headers.range) h.range = req.headers.range;
      const r = await fetch(u, { headers: h });
      res.status(r.status);
      for (const n of ['content-length', 'content-range', 'accept-ranges']) {
        const v = r.headers.get(n); if (v) res.setHeader(n, v);
      }
      res.setHeader('Content-Type', k === 'tvideo' ? 'video/mp4' : 'image/jpeg');
      res.setHeader('Cache-Control', k === 'tvideo' ? 'private, max-age=3600' : 'public, max-age=86400');
      return Readable.fromWeb(r.body).pipe(res);
    }
    if (k === 'tlist') {
      const me = await whoami(req).catch(() => null);
      const all = Object.values(await redis.hgetall('tutos') || {}).sort((a, b) => b.ts - a.ts);
      const out = await Promise.all(all.map(async t => ({
        id: t.id, title: t.title, desc: t.desc || '', ts: t.ts, size: t.size || 0,
        likes: Number(await redis.scard('tl:' + t.id)) || 0,
        views: Number(await redis.hget('tviews', t.id)) || 0,
        cm: Number(await redis.hlen('tcm:' + t.id)) || 0,
        mine: me ? !!(await redis.sismember('tl:' + t.id, me)) : false,
      })));
      res.setHeader('Cache-Control', 'no-store');
      return res.json(out);
    }
    if (k === 'tcm') {
      const [c, bd] = await Promise.all([redis.hgetall('tcm:' + id), redis.hgetall('badges')]);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(Object.values(c || {}).sort((a, b) => b.ts - a.ts).map(x => ({ ...x, badge: (bd || {})[x.name] || '' })));
    }
    return res.status(400).end();
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end();
  const me = await whoami(req);
  if (!me) return res.status(401).json({ error: 'Please log in again' });
  const b = req.body || {}, tid = String(b.id || '');
  if (!tid || !await redis.hexists('tutos', tid)) return res.status(400).json({ error: 'Invalid request' });
  if (k === 'tlike') {
    const had = await redis.sismember('tl:' + tid, me);
    if (b.on && !had) await redis.sadd('tl:' + tid, me);
    else if (!b.on && had) await redis.srem('tl:' + tid, me);
    return res.json({ ok: true, n: Number(await redis.scard('tl:' + tid)) || 0 });
  }
  if (k === 'tview') {   // 1 vue par compte
    if (await redis.sadd('tv:' + tid, me)) await redis.hincrby('tviews', tid, 1);
    return res.json({ ok: true });
  }
  if (k === 'tcm') {
    if (req.method === 'DELETE') {   // chacun peut supprimer son propre commentaire
      const c = await redis.hget('tcm:' + tid, String(b.cid || ''));
      if (c && c.name === me) await redis.hdel('tcm:' + tid, c.id);
      return res.json({ ok: true });
    }
    const text = String(b.text || '').trim().slice(0, 300);
    if (!text) return res.status(400).json({ error: 'Write something first' });
    if (await limit('rl:tc:' + me, 5, 60)) return res.status(429).json({ error: 'Too many comments, wait a moment' });
    const cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await redis.hset('tcm:' + tid, { [cid]: { id: cid, name: me, text, ts: Date.now() } });
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: 'Invalid request' });
}

/* ===== LIKES / VUES / NOTIFICATIONS PUSH (code d'origine) ===== */
export default async (req, res) => {
  if (TK.includes(String(req.query.k))) return tutos(req, res, String(req.query.k));
  if (req.query.k === 'pushkey') {   // clé publique VAPID nécessaire au navigateur pour s'abonner (rien de secret ici) — vérifié en premier
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(500).json({ error: 'Push not configured' });
    return res.json({ key: process.env.VAPID_PUBLIC_KEY });
  }
  if (req.method === 'GET') {   // fichiers likés par cet utilisateur (pour l'état ❤ au chargement)
    const v = String(req.query.v || '').trim().toLowerCase();
    if (!v) return res.json([]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json((await redis.smembers('ulikes:' + v)) || []);
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
