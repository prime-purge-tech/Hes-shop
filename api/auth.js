import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { redis, limit, ip } from '../lib/db.js';
const kdf = promisify(scrypt);

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (await limit('rl:a:' + ip(req), 15, 600)) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const { action, username, password } = req.body || {};
  const n = String(username || '').trim().toLowerCase(), p = String(password || '');
  if (!/^[a-z0-9_.-]{3,20}$/.test(n) || p.length < 4 || p.length > 100)
    return res.status(400).json({ error: 'Username: 3-20 letters, digits, _ . - and password 4+' });

  if (action === 'register') {
    const salt = randomBytes(16).toString('hex');
    const h = (await kdf(p, salt, 32)).toString('hex');
    const ok = await redis.hsetnx('users', n, { salt, h, exp: Date.now() + 30 * 864e5 });
    return ok ? res.json({ ok: true }) : res.status(409).json({ error: 'This username already exists' });
  }
  const u = await redis.hget('users', n);
  const h = u && await kdf(p, u.salt, 32);
  if (!u || !timingSafeEqual(h, Buffer.from(u.h, 'hex'))) return res.status(401).json({ error: 'Wrong username or password' });
  const token = randomBytes(24).toString('hex');
  await redis.set('sess:' + token, n, { ex: 30 * 86400 });
  res.json({ name: n, exp: u.exp, token });
};
