import { Redis } from '@upstash/redis';
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
export const tg = (m, b) =>
  fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
  }).then(r => r.json());
// propriétaire (OWNER_ID) + admins ajoutés avec /addadmin
export const admins = async () =>
  [...new Set([String(process.env.OWNER_ID), ...(await redis.smembers('admins')).map(String)])];
export const isAdmin = async id => (await admins()).includes(String(id));
// true si la limite est dépassée (max requêtes par fenêtre de sec secondes)
export const limit = async (k, max, sec) => { const n = await redis.incr(k); if (n === 1) await redis.expire(k, sec); return n > max; };
export const ip = req => (req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
