import { redis, tg, admins, limit, ip, whoami } from '../lib/db.js';
const esc = s => s.replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';');
const KIND = { photo: '📷 Photo', video: '🎬 Video', voice: '🎤 Voice message' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// extrait les @mentions d'un texte et ne garde que les comptes qui existent réellement (jamais soi-même)
async function parseMentions(text, author) {
  const cand = [...new Set((text.match(/@([a-z0-9_]{3,20})/gi) || []).map(m => m.slice(1).toLowerCase()))].filter(n => n !== author);
  if (!cand.length) return [];
  const ok = await Promise.all(cand.map(n => redis.hexists('users', n)));
  return cand.filter((_, i) => ok[i]);
}

export default async (req, res) => {
  const bg = async () => await redis.hgetall('badges') || {};   // badges donnés par les admins du bot

  /* ---------- chat public (identité vérifiée par le jeton) ---------- */
  if (req.query.k === 'chat') {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=4');
      const b = await bg(), me = await whoami(req);
      const list = Object.values(await redis.hgetall('chm') || {}).sort((a, c) => a.ts - c.ts).slice(-60);
      // le nombre de vues d'un message n'est renvoyé qu'à son propre auteur
      const out = await Promise.all(list.map(async m => ({
        ...m, badge: b[m.name] || '',
        views: me && m.name === me ? await redis.scard('mv:' + m.id) : undefined,
      })));
      return res.json(out);
    }
    const me = await whoami(req), b = req.body || {};
    if (!me) return res.status(401).json({ error: 'Log in again' });
    if (req.method === 'PATCH') {   // modifier son propre message texte
      const m = await redis.hget('chm', String(b.id)), text = String(b.text || '').trim().slice(0, 300);
      if (!m || m.name !== me || m.sticker || m.media || !text) return res.status(403).json({ error: 'Not allowed' });
      const mentions = await parseMentions(text, me);
      await redis.hset('chm', { [m.id]: { ...m, text, mentions, edited: true } });
      await Promise.all(mentions.map(n => redis.hset('ment:' + n, { [m.id]: 1 })));
      return res.json({ ok: true });
    }
    if (req.method === 'DELETE') {   // supprimer son propre message
      const m = await redis.hget('chm', String(b.id));
      if (!m || m.name !== me) return res.status(403).json({ error: 'Not allowed' });
      await redis.hdel('chm', m.id);
      await redis.del('mv:' + m.id);
      await Promise.all((m.mentions || []).map(n => redis.hdel('ment:' + n, m.id)));
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
      const mentions = await parseMentions(msg.text, me);
      if (mentions.length) msg.mentions = mentions;
    }
    if (b.re) {   // réponse à un message
      const r = await redis.hget('chm', String(b.re));
      if (r) msg.re = { id: r.id, name: r.name, t: r.text ? r.text.slice(0, 60) : r.sticker ? '😊 Sticker' : KIND[r.media?.type] || '' };
    }
    await redis.hset('chm', { [msg.id]: msg });
    // notifie chaque mention (@pseudo) : reste "non lu" jusqu'à ce que la personne clique dessus
    if (msg.mentions) await Promise.all(msg.mentions.map(n => redis.hset('ment:' + n, { [msg.id]: 1 })));
    const n = await redis.hlen('chm');
    if (n > 300) {
      const old = Object.values(await redis.hgetall('chm')).sort((a, c) => a.ts - c.ts).slice(0, n - 150);
      await redis.hdel('chm', ...old.map(x => x.id));
      await Promise.all(old.map(x => redis.del('mv:' + x.id)));
    }
    return res.json({ ok: true });
  }

  /* ---------- vues d'un message de chat : on marque les messages des autres comme "vus par moi" ---------- */
  if (req.query.k === 'seen') {
    if (req.method !== 'POST') return res.status(405).end();
    const me = await whoami(req);
    if (!me) return res.status(401).json({ error: 'Log in again' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 60).map(String) : [];
    await Promise.all(ids.map(async id => {
      const m = await redis.hget('chm', id);
      if (m && m.name !== me) await redis.sadd('mv:' + id, me);
    }));
    return res.json({ ok: true });
  }

  /* ---------- messages non lus du chat (compteur global) ---------- */
  if (req.query.k === 'unread') {
    const me = await whoami(req);
    if (!me) return res.status(401).json({ error: 'Log in again' });
    if (req.method === 'POST') { await redis.hset('lastread', { [me]: Date.now() }); return res.json({ ok: true }); }
    const last = Number((await redis.hget('lastread', me)) || 0);
    const n = Object.values(await redis.hgetall('chm') || {}).filter(m => m.ts > last && m.name !== me).length;
    return res.json({ n });
  }

  /* ---------- tags (@mentions) non lus : liste + marquer comme lu ---------- */
  if (req.query.k === 'mentions') {
    const me = await whoami(req);
    if (!me) return res.status(401).json({ error: 'Log in again' });
    if (req.method === 'POST') {
      const id = String(req.body?.id || '');
      if (id) await redis.hdel('ment:' + me, id); else await redis.del('ment:' + me);
      return res.json({ ok: true });
    }
    const m = await redis.hgetall('ment:' + me) || {};
    const ids = Object.keys(m);
    const list = (await Promise.all(ids.map(id => redis.hget('chm', id)))).filter(Boolean).sort((a, c) => a.ts - c.ts);
    // nettoie les tags dont le message a été supprimé entretemps
    const gone = ids.filter(id => !list.find(x => x.id === id));
    if (gone.length) await redis.hdel('ment:' + me, ...gone);
    return res.json({ n: list.length, ids: list.map(x => x.id) });
  }

  /* ---------- vues d'un fichier / APK : publiques, visibles par tout le monde ---------- */
  if (req.query.k === 'view') {
    const id = String(req.query.id || req.body?.id || '');
    if (!id) return res.status(400).end();
    if (req.method === 'POST') { const n = await redis.hincrby('fviews', id, 1); return res.json({ n }); }
    const n = Number((await redis.hget('fviews', id)) || 0);
    return res.json({ n });
  }
  if (req.query.k === 'views') {
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Cache-Control', 's-maxage=10');
    return res.json(await redis.hgetall('fviews') || {});
  }

  /* ---------- pub du site : celle réglée par un admin, sinon une pub H'ES STORE ou un fichier à badge ---------- */
  if (req.query.k === 'ad') {
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Cache-Control', 'no-store');
    const ad = await redis.get('ad');
    if (ad) return res.json(ad);
    const restrict = await redis.hgetall('restrict') || {};
    const ids = Object.keys(restrict);
    if (ids.length && Math.random() < 0.5) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const it = await redis.hget('items', id);
      if (it) return res.json({ type: 'apk', id, title: it.title, badge: restrict[id], hasImg: !!it.photo });
    }
    return res.json({ type: 'brand' });
  }

  /* ---------- notifications (envoyées par les admins depuis le bot) ---------- */
  if (req.query.k === 'notif') {
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Cache-Control', 's-maxage=10');
    return res.json(Object.values(await redis.hgetall('notifs') || {}).sort((a, c) => c.ts - a.ts).slice(0, 20));
  }

  /* ---------- notes (1 à 5 étoiles) et avis d'une publication ---------- */
  if (req.query.k === 'rev') {
    const id = String(req.query.id || req.body?.id || '');
    if (!id || !await redis.hexists('items', id)) return res.status(404).end();
    if (req.method === 'POST') {
      const me = await whoami(req);
      if (!me) return res.status(401).json({ error: 'Log in again' });
      if (await limit('rl:v:' + me, 10, 600)) return res.status(429).json({ error: 'Too many reviews, wait a moment.' });
      const stars = parseInt(req.body?.stars);
      if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars' });
      const text = String(req.body?.text || '').trim().slice(0, 300);
      const old = await redis.hget('rv:' + id, me), agg = (await redis.hget('rat', id)) || { s: 0, n: 0 };
      agg.s += stars - (old ? old.stars : 0);
      if (!old) agg.n++;
      await redis.hset('rv:' + id, { [me]: { name: me, stars, text, ts: Date.now() } });
      await redis.hset('rat', { [id]: agg });
      if (!old) {
        const it = await redis.hget('items', id);
        await Promise.all((await admins()).map(a => tg('sendMessage', { chat_id: a, text: `⭐ ${me} : ${stars}/5 — ${it?.title}${text ? '\n' + text : ''}` }).catch(() => {})));
      }
      return res.json({ ok: true, avg: +(agg.s / agg.n).toFixed(1), n: agg.n });
    }
    const all = Object.values(await redis.hgetall('rv:' + id) || {}), who = await whoami(req), b = await bg();
    const n = all.length, dist = [1, 2, 3, 4, 5].map(v => all.filter(x => x.stars === v).length);
    return res.json({
      n, dist, avg: n ? +(all.reduce((a, x) => a + x.stars, 0) / n).toFixed(1) : 0,
      mine: all.find(x => x.name === who) || null,
      list: all.sort((a, c) => c.ts - a.ts).slice(0, 30).map(x => ({ ...x, badge: b[x.name] || '' })),
    });
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
