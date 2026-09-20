import { redis, brandName } from '../lib/db.js';
export default async (req, res) => {
  const [lk, dl] = await Promise.all([redis.hgetall('likes'), redis.hgetall('dls')]);
  const items = Object.values(await redis.hgetall('items') || {})
    .sort((a, b) => b.ts - a.ts)
    .map(({ file, photo, shots, ...p }) => ({   // file_id jamais exposés
      ...p, hasImg: !!photo, ns: (shots || []).length, dn: brandName(p.title, p.name),
      likes: Number((lk || {})[p.id]) || 0, dls: Number((dl || {})[p.id]) || 0,
    }));
  res.setHeader('Cache-Control', 's-maxage=15');
  res.json({ bot: process.env.BOT_USERNAME, items });
};
