import { redis } from '../lib/db.js';
const sum = o => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
export default async (req, res) => {
  // classement des membres : on lit seulement les NOMS du hash users (jamais les mots de passe)
  if (req.query.users) {
    res.setHeader('Cache-Control', 's-maxage=30');
    const [all, udls, badges] = await Promise.all([
      redis.hgetall('users'), redis.hgetall('udls'), redis.hgetall('badges'),
    ]);
    const list = Object.keys(all || {}).map(name => ({
      name,
      dls: Number((udls || {})[name]) || 0,
      badge: (badges || {})[name] || '',
    })).sort((a, b) => b.dls - a.dls || a.name.localeCompare(b.name));
    return res.json(list);
  }
  const [accounts, files, dls, likes] = await Promise.all([
    redis.hlen('users'), redis.hlen('items'), redis.hgetall('dls'), redis.hgetall('likes'),
  ]);
  res.setHeader('Cache-Control', 's-maxage=30');
  res.json({ accounts, files, downloads: sum(dls), likes: sum(likes) });
};
