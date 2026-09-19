import { redis } from '../lib/db.js';
export default async (req, res) => {
  const [accounts, files] = await Promise.all([redis.hlen('users'), redis.hlen('items')]);
  res.setHeader('Cache-Control', 's-maxage=30');
  res.json({ accounts, files });
};
