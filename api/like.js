import { redis, limit, ip } from '../lib/db.js';
export default async (req, res) => {
  const { id, v, on } = req.body || {};
  if (req.method !== 'POST' || !id || !v || !await redis.hexists('items', String(id))) return res.status(400).end();
  if (await limit('rl:l:' + ip(req), 30, 60)) return res.status(429).end();
  const k = 'lk:' + id;
  const changed = on ? await redis.sadd(k, String(v)) : await redis.srem(k, String(v));
  if (changed) await redis.hincrby('likes', String(id), on ? 1 : -1);
  res.json({ n: Number(await redis.hget('likes', String(id))) || 0 });
};
