import { redis } from '../lib/db.js';
const sum = o => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
export default async (req, res) => {
  const [accounts, files, dls, likes] = await Promise.all([
    redis.hlen('users'), redis.hlen('items'), redis.hgetall('dls'), redis.hgetall('likes'),
  ]);
  res.setHeader('Cache-Control', 's-maxage=30');
  res.json({ accounts, files, downloads: sum(dls), likes: sum(likes) });
};
