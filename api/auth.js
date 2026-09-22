import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { redis, limit, ip, whoami } from '../lib/db.js';
const kdf = promisify(scrypt);

export default async (req, res) => {
  if (req.method === 'GET') {   // vérifie un jeton déjà stocké (connexion auto)
    const me = await whoami(req);
    if (!me) return res.status(401).end();
    const u = await redis.hget('users', me);
    return res.json({ name: me, exp: u?.exp || 0 });
  }
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

  if (action === 'update') {
    const nu = String(req.body?.newUsername || '').trim().toLowerCase(), np = String(req.body?.newPassword || '');
    if (!nu && !np) return res.status(400).json({ error: 'Nothing to update' });
    if (nu && !/^[a-z0-9_.-]{3,20}$/.test(nu)) return res.status(400).json({ error: 'Username: 3-20 letters, digits, _ . -' });
    if (np && (np.length < 4 || np.length > 100)) return res.status(400).json({ error: 'Password must be 4+ characters' });
    let target = n, rec = u;
    if (nu && nu !== n) {
      if (!await redis.hsetnx('users', nu, u)) return res.status(409).json({ error: 'This username already exists' });
      await redis.hdel('users', n); target = nu;
    }
    if (np) { const salt = randomBytes(16).toString('hex'); rec = { ...rec, salt, h: (await kdf(np, salt, 32)).toString('hex') }; }
    if (nu !== n || np) await redis.hset('users', { [target]: rec });
    const token = randomBytes(24).toString('hex');
    await redis.set('sess:' + token, target, { ex: 30 * 86400 });
    return res.json({ ok: true, name: target, exp: rec.exp, token });
  }
  const token = randomBytes(24).toString('hex');
  await redis.set('sess:' + token, n, { ex: 30 * 86400 });
  res.json({ name: n, exp: u.exp, token });
};
