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
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const kdf = promisify(scrypt);
// renvoie le compte si le mot de passe est bon, sinon null
export const checkPw = async (n, p) => {
  const u = await redis.hget('users', n);
  if (!u) return null;
  return timingSafeEqual(await kdf(p, u.salt, 32), Buffer.from(u.h, 'hex')) ? u : null;
};
// identité de l'utilisateur connecté (jeton envoyé par le site)
export const whoami = async req => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const u = t ? await redis.get('sess:' + t) : null;
  return u == null ? null : String(u);
};
export const BRAND = "H'ES SHOP";
const clean = s => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim();
// nom des fichiers téléchargés : « H'ES SHOP - Titre.apk »
export const brandName = (title, name) => {
  const ext = /\.\w{1,6}$/.exec(name || '');
  return `${BRAND} - ${clean(title).slice(0, 60) || 'file'}${ext ? ext[0] : ''}`;
};
export const cdisp = n => `attachment; filename="${n.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(n).replace(/'/g, '%27')}`;
