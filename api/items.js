import { redis } from '../lib/db.js';
export default async (req, res) => {
  const [lk, dl] = await Promise.all([redis.hgetall('likes'), redis.hgetall('dls')]);
  const items = Object.values(await redis.hgetall('items') || {})
    .sort((a, b) => b.ts - a.ts)
    .map(({ file, photo, ...p }) => ({ ...p, hasImg: !!photo, likes: Number((lk || {})[p.id]) || 0, dls: Number((dl || {})[p.id]) || 0 }));   // file_id jamais exposés
  res.setHeader('Cache-Control', 's-maxage=15');
  res.json({ bot: process.env.BOT_USERNAME, items });
};
