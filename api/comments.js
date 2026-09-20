import { redis, tg, admins, limit, ip, whoami } from '../lib/db.js';
const esc = s => s.replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';');
const KIND = { photo: '📷 Photo', video: '🎬 Video', voice: '🎤 Voice message' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default async (req, res) => {
  const bg = async () => await redis.hgetall('badges') || {};   // badges donnés par les admins du bot

  /* ---------- chat public (identité vérifiée par le jeton) ---------- */
  if (req.query.k === 'chat') {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=4');
      const b = await bg();
      return res.json(Object.values(await redis.hgetall('chm') || {}).sort((a, c) => a.ts - c.ts).slice(-60).map(m => ({ ...m, badge: b[m.name] || '' })));
    }
    const me = await whoami(req), b = req.body || {};
    if (!me) return res.status(401).json({ error: 'Log in again' });
    if (req.method === 'PATCH') {   // modifier son propre message texte
      const m = await redis.hget('chm', String(b.id)), text = String(b.text || '').trim().slice(0, 300);
      if (!m || m.name !== me || m.sticker || m.media || !text) return res.status(403).json({ error: 'Not allowed' });
      await redis.hset('chm', { [m.id]: { ...m, text, edited: true } });
      return res.json({ ok: true });
    }
    if (await limit('rl:c:' + me, 20, 60)) return res.status(429).json({ error: 'Too many messages, wait a moment.' });
    const msg = { id: uid(), name: me, ts: Date.now() };
    if (b.sticker) {
      const p = await redis.hget('packs', String(b.sticker.p));
      if (!p || !p.ids.includes(String(b.sticker.s))) return res.status(400).json({ error: 'Unknown sticker' });
      msg.sticker = { p: p.id, s: String(b.sticker.s) };
    } else if (b.media) {
      const m = await redis.hget('media', String(b.media));
      if (!m || m.owner !== me) return res.status(400).json({ error: 'Unknown file' });
      msg.media = { k: m.k, type: m.type, d: Math.min(600, Number(b.d) || 0), n: m.name };
    } else {
      msg.text = String(b.text || '').trim().slice(0, 300);
      if (!msg.text) return res.status(400).json({ error: 'Write a message.' });
    }
    if (b.re) {   // réponse à un message
      const r = await redis.hget('chm', String(b.re));
      if (r) msg.re = { id: r.id, name: r.name, t: r.text ? r.text.slice(0, 60) : r.sticker ? '😊 Sticker' : KIND[r.media?.type] || '' };
    }
    await redis.hset('chm', { [msg.id]: msg });
    const n = await redis.hlen('chm');
    if (n > 300) {
      const old = Object.values(await redis.hgetall('chm')).sort((a, c) => a.ts - c.ts).slice(0, n - 150);
      await redis.hdel('chm', ...old.map(x => x.id));
    }
    return res.json({ ok: true });
  }

  /* ---------- commentaires (notifiés aux admins) ---------- */
  if (req.method === 'POST') {
    if (await limit('rl:m:' + ip(req), 5, 600)) return res.status(429).json({ error: 'Too many messages, try again later.' });
    const name = String(await whoami(req) || req.body?.name || '').trim().slice(0, 30) || 'Anonyme';
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Write a message.' });
    const stars = Math.max(0, Math.min(5, parseInt(req.body?.stars) || 0));
    const c = { id: uid(), name, text, stars, ts: Date.now() };
    await redis.hset('cm', { [c.id]: c });
    await Promise.all((await admins()).map(async a => {
      const r = await tg('sendMessage', { chat_id: a, parse_mode: 'HTML', text: `💬 <b>${esc(name)}</b>${stars ? ' ' + '★'.repeat(stars) : ''}\n${esc(text)}\n\n↩️ Réponds à ce message pour répondre sur le site (ou « /del » pour le supprimer)` }).catch(() => null);
      if (r?.ok) await redis.set(`nm:${a}:${r.result.message_id}`, c.id, { ex: 2592000 });
    }));
    return res.json({ ok: true });
  }
  const b = await bg();
  res.json(Object.values(await redis.hgetall('cm') || {}).sort((a, c) => c.ts - a.ts).slice(0, 30).map(c => ({ ...c, badge: b[c.name] || '' })));
};
