import { redis, checkPw, limit, ip } from '../lib/db.js';
import { defPic as def } from '../lib/pics.js';
const WEEK = 7 * 864e5;

export default async (req, res) => {
  if (req.method === 'GET') {
    const n = String(req.query.u || '').toLowerCase(), u = await redis.hget('users', n);
    if (!u) return res.status(404).end();
    if (req.query.img) {   // image seule (chat), mise en cache
      if (!u.photo) return res.redirect(302, def(n));
      res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');
      return res.end(Buffer.from(u.photo.split(',')[1], 'base64'));
    }
    return res.json({ photo: u.photo || def(n), next: u.pt ? u.pt + WEEK : 0, badge: (await redis.hget('badges', n)) || '' });
  }
  if (await limit('rl:p:' + ip(req), 10, 600)) return res.status(429).json({ error: 'Too many attempts, try again later' });
  const { u: n0, p, photo, reset } = req.body || {}, n = String(n0 || '').toLowerCase();
  const u = await checkPw(n, String(p || ''));
  if (!u) return res.status(401).json({ error: 'Wrong password' });
  if (u.pt && Date.now() - u.pt < WEEK)
    return res.status(429).json({ error: 'You can change your profile again on ' + new Date(u.pt + WEEK).toLocaleDateString('en-GB') });
  if (!reset && !(typeof photo === 'string' && photo.length < 80000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)))
    return res.status(400).json({ error: 'Invalid photo' });
  const nu = { ...u, photo: reset ? '' : photo, pt: Date.now() };
  await redis.hset('users', { [n]: nu });
  res.json({ ok: true, photo: nu.photo || def(n), next: nu.pt + WEEK });
};
