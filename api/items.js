import { redis } from '../lib/db.js';
export default async (req, res) => {
  const items = Object.values(await redis.hgetall('items') || {})
    .sort((a, b) => b.ts - a.ts)
    .map(({ file, photo, ...pub }) => ({ ...pub, hasImg: !!photo }));   // file_id jamais exposés
  res.setHeader('Cache-Control', 's-maxage=30');
  res.json({ bot: process.env.BOT_USERNAME, items });
};
