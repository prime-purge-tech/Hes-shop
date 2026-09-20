import { redis, whoami, limit } from '../lib/db.js';

export default async (req, res) => {
  const q = req.query;
  if (req.method === 'GET' && q.p && q.s) {   // image d'un sticker
    const d = await redis.hget('stk:' + q.p, String(q.s)), m = typeof d === 'string' && /^data:(image\/\w+);base64,(.+)$/.exec(d);
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(Buffer.from(m[2], 'base64'));
  }
  const me = await whoami(req);
  if (req.method === 'GET') {                  // tous les packs + ma collection
    const packs = Object.values(await redis.hgetall('packs') || {}).sort((a, b) => b.ts - a.ts).slice(0, 60);
    return res.json({ packs, mine: me ? (await redis.smembers('sp:' + me)).map(String) : [] });
  }
  if (!me) return res.status(401).json({ error: 'Log in again' });
  const b = req.body || {};
  if (b.add) {
    if (!await redis.hexists('packs', String(b.add))) return res.status(404).end();
    await redis.sadd('sp:' + me, String(b.add)); return res.json({ ok: true });
  }
  if (b.rm) { await redis.srem('sp:' + me, String(b.rm)); return res.json({ ok: true }); }
  if (b.del) {
    const p = await redis.hget('packs', String(b.del));
    if (p && p.owner === me) { await redis.hdel('packs', p.id); await redis.del('stk:' + p.id); }
    return res.json({ ok: true });
  }
  if (await limit('rl:s:' + me, 5, 3600)) return res.status(429).json({ error: 'Too many packs, try again later' });
  const imgs = (Array.isArray(b.imgs) ? b.imgs : []).slice(0, 20)
    .filter(x => typeof x === 'string' && x.length < 90000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x));
  const name = String(b.name || '').trim().slice(0, 24);
  if (!name || !imgs.length) return res.status(400).json({ error: 'Add a name and at least one photo' });
  const id = Date.now().toString(36), ids = imgs.map((_, i) => 's' + i);
  await redis.hset('stk:' + id, Object.fromEntries(imgs.map((d, i) => ['s' + i, d])));
  await redis.hset('packs', { [id]: { id, name, owner: me, ts: Date.now(), ids } });
  await redis.sadd('sp:' + me, id);
  res.json({ ok: true, id });
};

