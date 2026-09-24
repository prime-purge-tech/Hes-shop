import { redis, brandName } from '../lib/db.js';
export default async (req, res) => {
  const [lk, dl, rat, res_, vw] = await Promise.all([redis.hgetall('likes'), redis.hgetall('dls'), redis.hgetall('rat'), redis.hgetall('restrict'), redis.hgetall('views')]);
  const items = Object.values(await redis.hgetall('items') || {})
    .sort((a, b) => b.ts - a.ts)
    .map(({ file, photo, shots, blob, ...p }) => ({   // file_id et lien du stockage jamais exposés
      ...p, hasImg: !!photo, ns: (shots || []).length, dn: brandName(p.title, p.name), badge: (res_ || {})[p.id] || '',
      rt: (rat || {})[p.id] ? +((rat[p.id].s) / rat[p.id].n).toFixed(1) : 0, rn: (rat || {})[p.id]?.n || 0,
      likes: Number((lk || {})[p.id]) || 0, views: Number((vw || {})[p.id]) || 0, dls: Number((dl || {})[p.id]) || 0,
    }));
  res.setHeader('Cache-Control', 's-maxage=15');
  res.json({ bot: process.env.BOT_USERNAME, items });
};
