import { Readable } from 'node:stream';
import { redis, tg, whoami, limit } from '../lib/db.js';
export const config = { maxDuration: 60 };

const fileUrl = async fid => {
  const g = await tg('getFile', { file_id: fid });
  return g.ok ? `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}` : null;
};

export default async (req, res) => {
  const k = String(req.query.k || 'list'), id = String(req.query.id || '');

  if (req.method === 'GET') {
    // vidéo (avec Range pour pouvoir avancer / reculer) ou couverture
    if (k === 'video' || k === 'cover') {
      const t = await redis.hget('tutos', id);
      if (!t) return res.status(404).end();
      const u = await fileUrl(k === 'video' ? t.video : t.cover);
      if (!u) return res.status(404).end();
      const h = {};
      if (req.headers.range) h.range = req.headers.range;
      const r = await fetch(u, { headers: h });
      res.status(r.status);
      for (const n of ['content-length', 'content-range', 'accept-ranges']) {
        const v = r.headers.get(n); if (v) res.setHeader(n, v);
      }
      res.setHeader('Content-Type', k === 'video' ? 'video/mp4' : 'image/jpeg');
      res.setHeader('Cache-Control', k === 'video' ? 'private, max-age=3600' : 'public, max-age=86400');
      return Readable.fromWeb(r.body).pipe(res);
    }
    // liste des tutos
    if (k === 'list') {
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
    // commentaires d'un tuto
    if (k === 'cm') {
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

  if (k === 'like') {
    const had = await redis.sismember('tl:' + tid, me);
    if (b.on && !had) await redis.sadd('tl:' + tid, me);
    else if (!b.on && had) await redis.srem('tl:' + tid, me);
    return res.json({ ok: true, n: Number(await redis.scard('tl:' + tid)) || 0 });
  }
  if (k === 'view') {   // 1 vue par compte
    if (await redis.sadd('tv:' + tid, me)) await redis.hincrby('tviews', tid, 1);
    return res.json({ ok: true });
  }
  if (k === 'cm') {
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
};
