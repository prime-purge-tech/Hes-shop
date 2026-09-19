import { redis, tg, admins } from '../lib/db.js';
const esc = s => s.replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';');

export default async (req, res) => {
  if (req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0];
    const n = await redis.incr('rl:' + ip);
    if (n === 1) await redis.expire('rl:' + ip, 600);
    if (n > 5) return res.status(429).json({ error: 'Too many messages, try again in a few minutes.' });
    const name = String(req.body?.name || '').trim().slice(0, 30) || 'Anonymous';
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Write a message.' });
    await redis.lpush('comments', { name, text, ts: Date.now() });
    await redis.ltrim('comments', 0, 99);
    // envoi du commentaire à tous les admins
    await Promise.all((await admins()).map(a =>
      tg('sendMessage', { chat_id: a, parse_mode: 'HTML', text: `💬 <b>${esc(name)}</b>\n${esc(text)}` }).catch(() => {})));
    return res.json({ ok: true });
  }
  res.json(await redis.lrange('comments', 0, 29));
};
