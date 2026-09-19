import { redis } from '../lib/db.js';

// Comptes créés sur le site + nombre de fichiers APK / ZIP publiés
export default async (req, res) => {
  const [accounts, items] = await Promise.all([redis.hlen('accounts'), redis.hgetall('items')]);
  const files = Object.values(items || {}).filter(i => /\.(apk|zip)$/i.test(i.name || '')).length;
  res.setHeader('Cache-Control', 's-maxage=15');
  res.json({ accounts, files });
};
