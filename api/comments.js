import { redis, tg, admins, limit, ip } from '../lib/db.js';
const esc = s => s.replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';');

export default async (req, res) => {
  const chat = req.query.k === 'chat';
  if (req.method === 'POST') {
    if (await limit(`rl:${chat ? 'c' : 'm'}:${ip(req)}`, chat ? 20 : 5, chat ? 60 : 600))
      return res.status(429).json({ error: 'Trop de messages, réessaie dans un moment.' });
    const name = String(req.body?.name || '').trim().slice(0, 30) || 'Anonyme';
    const text = String(req.body?.text || '').trim().slice(0, chat ? 300 : 500);
    if (!text) return res.status(400).json({ error: 'Écris un message.' });
    const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, text, ts: Date.now() };
    if (chat) {                       // chat public : pas de notification aux admins
      await redis.lpush('chat', c); await redis.ltrim('chat', 0, 99);
      return res.json({ ok: true });
    }
    await redis.hset('cm', { [c.id]: c });
    await Promise.all((await admins()).map(async a => {
      const r = await tg('sendMessage', { chat_id: a, parse_mode: 'HTML', text: `💬 <b>${esc(name)}</b>\n${esc(text)}\n\n↩️ Réponds à ce message pour répondre sur le site (ou « /del » pour le supprimer)` }).catch(() => null);
      if (r?.ok) await redis.set(`nm:${a}:${r.result.message_id}`, c.id, { ex: 2592000 });
    }));
    return res.json({ ok: true });
  }
  if (chat) {
    res.setHeader('Cache-Control', 's-maxage=4');
    return res.json((await redis.lrange('chat', 0, 49)).reverse());
  }
  res.json(Object.values(await redis.hgetall('cm') || {}).sort((a, b) => b.ts - a.ts).slice(0, 30));
};
