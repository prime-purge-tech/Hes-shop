import { redis, verifyPassword } from '../lib/db.js';

const WEEK = 7 * 864e5;
const DEFAULT_SVG = n => {
  const c = ['#1e88e5', '#8e24aa', '#1faa59', '#e0405a', '#c9a86a', '#39c0ff'][[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];
  const letter = (String(n || '?')[0] || '?').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="${c}"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Arial,sans-serif" font-size="46" fill="#fff">${letter}</text></svg>`;
};

function parseDataUrl(s) {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(s || ''));
  return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}

const handler = async (req, res) => {
  const u = String(req.query.u || req.body?.u || '').trim().toLowerCase();
  if (!u) return res.status(400).end();

  if (req.method === 'GET' && req.query.img) {   // avatar (image brute, utilisée par <img src>)
    const prof = await redis.hget('profiles', u), d = prof?.photo && parseDataUrl(prof.photo);
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (d) { res.setHeader('Content-Type', d.mime); return res.end(d.buf); }
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end(DEFAULT_SVG(u));
  }

  if (req.method === 'GET') {   // infos publiques du profil (photo en data URL, badge, prochain changement possible)
    const [prof, badge] = await Promise.all([redis.hget('profiles', u), redis.hget('badges', u)]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ photo: prof?.photo || '/api/profile?img=1&u=' + encodeURIComponent(u), badge: badge || '', next: prof?.next || 0 });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const me = await verifyPassword(u, req.body?.p);
  if (!me) return res.status(401).json({ error: 'Wrong username or password' });
  const reset = !!req.body?.reset, photo = req.body?.photo;
  if (!reset && !photo) return res.status(400).json({ error: 'Choose a photo first' });

  const prof = (await redis.hget('profiles', me)) || {};
  if (prof.next > Date.now()) return res.status(429).json({ error: 'You can only change your profile once a week' });

  if (reset) {
    await redis.hset('profiles', { [me]: { next: Date.now() + WEEK } });
    return res.json({ ok: true, photo: '' });
  }
  const d = parseDataUrl(photo);
  if (!d || !/^image\/(jpeg|png|webp)$/.test(d.mime) || d.buf.length > 400 * 1024)
    return res.status(400).json({ error: 'Image too large or invalid' });
  await redis.hset('profiles', { [me]: { photo, next: Date.now() + WEEK } });
  res.json({ ok: true, photo });
};

export default async (req, res) => {
  try { return await handler(req, res); }
  catch (e) {
    if (res.headersSent) return;
    if (req.query?.img) { res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'no-store'); return res.end(DEFAULT_SVG(String(req.query.u || '?').trim().toLowerCase())); }
    return res.status(500).json({ error: 'Profile unavailable: ' + (e.message || e) });
  }
};
