import { redis } from '../lib/db.js';
export default async (req, res) => {
  const lk = await redis.hgetall('likes') || {};
  const items = Object.values(await redis.hgetall('items') || {})
    .sort((a, b) => b.ts - a.ts)
    .map(({ file, photo, ...p }) => ({ ...p, likes: Number(lk[p.id]) || 0 }));   // file_id jamais exposés
  res.setHeader('Cache-Control', 's-maxage=15');
  res.json({ bot: process.env.BOT_USERNAME, items });
};
