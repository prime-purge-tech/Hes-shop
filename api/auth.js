import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { redis } from '../lib/db.js';

const sc = promisify(scrypt);
const DAY = 864e5;

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // anti brute-force : 30 tentatives / 10 min / IP
  const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0];
  const n = await redis.incr('rl:auth:' + ip);
  if (n === 1) await redis.expire('rl:auth:' + ip, 600);
  if (n > 30) return res.status(429).json({ error: 'Too many attempts, try again in a few minutes.' });

  const action = req.body?.action;
  const name = String(req.body?.username || '').trim().toLowerCase();
  const pass = String(req.body?.password || '');
  if (!/^[a-z0-9_.-]{3,20}$/.test(name) || pass.length < 4 || pass.length > 100)
    return res.status(400).json({ error: 'Username: 3-20 characters (letters, digits, . _ -). Password: 4+ characters.' });

  if (action === 'register') {
    const salt = randomBytes(16).toString('hex');
    const hash = (await sc(pass, salt, 32)).toString('hex');
    const now = Date.now();
    const created = await redis.hsetnx('accounts', name, { salt, hash, ts: now, exp: now + 30 * DAY });
    if (!created) return res.status(409).json({ error: 'This username already exists' });
    return res.json({ ok: true });
  }

  if (action === 'login') {
    const acc = await redis.hget('accounts', name);
    if (acc) {
      const hash = await sc(pass, acc.salt, 32);
      const good = Buffer.from(acc.hash, 'hex');
      if (hash.length === good.length && timingSafeEqual(hash, good))
        return res.json({ ok: true, name, exp: acc.exp });
    }
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  res.status(400).json({ error: 'Unknown action' });
};
