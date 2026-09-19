import { redis, limit, ip } from '../lib/db.js';
export default async (req, res) => {
  // GET ?v=pseudo -> ids déjà likés par ce compte
  if (req.method === 'GET') return res.json((await redis.smembers('ul:' + String(req.query.v || '').slice(0, 40))).map(String));
  const { id, on } = req.body || {}, v = String(req.body?.v || '').slice(0, 40);
  if (req.method !== 'POST' || !id || !v || !await redis.hexists('items', String(id))) return res.status(400).end();
  if (await limit('rl:l:' + ip(req), 30, 60)) return res.status(429).end();
  const changed = on ? await redis.sadd('lk:' + id, v) : await redis.srem('lk:' + id, v);
  if (changed) {
    await redis.hincrby('likes', String(id), on ? 1 : -1);
    await (on ? redis.sadd('ul:' + v, String(id)) : redis.srem('ul:' + v, String(id)));
  }
  res.json({ n: Number(await redis.hget('likes', String(id))) || 0 });
};
