import { randomBytes } from 'node:crypto';
import { redis, tg, admins, isAdmin, BRAND, brandName } from '../lib/db.js';
const siteUrl = () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/$/, '');
const delBlob = async u => { try { const { del } = await import('@vercel/blob'); await del(u); } catch {} };
import { PICS, WELCOME_PIC } from '../lib/pics.js';
export const config = { maxDuration: 60 };

const HELP = `📥 Ajouter : envoie une photo avec en légende le titre (ligne 1) puis la description. Les photos suivantes (sans légende) = captures d'écran en bas de la page de l'app. Enfin envoie le fichier / APK.

/list — voir les publications
/del ID — supprimer une publication
/chat texte — écrire dans le chat du site
/clearchat — vider le chat
/pub [lien] [texte bouton] — en réponse à un message : l'envoyer à tous les utilisateurs du bot
/users — nombre d'utilisateurs
/badge pseudo blue|gold|off — donner un badge
/badges — voir les badges
/edit id — répondre avec /edit id, puis titre et description sur 2 lignes
/restrict id blue|gold|off — réserver un fichier à un badge (gold peut tout télécharger, blue pas les fichiers gold)
/upload — liens pour envoyer sur le site tous les gros fichiers (>20 Mo) pas encore en téléchargement direct\n/upload id — idem pour un seul fichier
/notify texte — notification envoyée à tous (site + Telegram)
/ad off — désactiver la pub du site
/ad page url délai(≤20s) — pub = ta page d'accueil, croix après le délai
/ad media délai lien texte — en réponse à une photo/vidéo : pub média sur le site
/admins — voir les admins
/addadmin ID · /rmadmin ID (propriétaire)

💬 Réponds à un commentaire reçu pour répondre sur le site, ou réponds « /del » pour le supprimer.`;

const SHOP = 'https://t.me/Hessbbot/hes_shop';
const BTN = { inline_keyboard: [[{ text: "𝙃'𝙀𝙎 𝙎𝙃𝙊𝙋", url: SHOP }]] };

const esc = s => String(s ?? '').replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';');
const nm = u => `<a href="tg://user?id=${u.id}">${esc(u.first_name || 'Membre')}</a>`;
const send = (chat, url, caption) => {
  const [meth, key] = /\.(gif|mp4)$/i.test(url) ? ['sendAnimation', 'animation'] : ['sendPhoto', 'photo'];
  return tg(meth, { chat_id: chat, [key]: url, caption, parse_mode: 'HTML', reply_markup: BTN })
    .then(r => r.ok ? r : tg('sendMessage', { chat_id: chat, text: caption, parse_mode: 'HTML', reply_markup: BTN }));
};

// bienvenue / au revoir dans les groupes
async function group(m) {
  for (const u of m.new_chat_members || [])
    if (!u.is_bot) await send(m.chat.id, WELCOME_PIC, `🎉 Bienvenue ${nm(u)} dans <b>${esc(m.chat.title)}</b> !\nPasse par notre boutique 👇`);
  const l = m.left_chat_member;
  if (l && !l.is_bot)
    await tg('sendMessage', { chat_id: m.chat.id, parse_mode: 'HTML', text: `👋 ${nm(l)} a quitté le groupe. À bientôt !`, reply_markup: BTN });
}

// lien d'envoi (valable 1 h) d'un gros fichier vers le stockage du site pour la publication `item`
async function upLink(item) {
  const tok = randomBytes(16).toString('hex');
  await redis.set('upt:' + tok, { item }, { ex: 3600 });
  return `${siteUrl()}/upload.html?k=${tok}`;
}

// envoie le fichier sous le nom « H'ES SHOP - Titre.ext » (re-envoi si < 20 Mo, sinon file_id d'origine)
async function sendBranded(chat, it) {
  const caption = `${it.title}\n\n🛒 ${BRAND}`;
  if (!it.size || it.size < 19e6) {
    try {
      const g = await tg('getFile', { file_id: it.file });
      if (g.ok) {
        const buf = await (await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`)).arrayBuffer();
        const fd = new FormData();
        fd.append('chat_id', String(chat)); fd.append('caption', caption);
        fd.append('document', new Blob([buf]), brandName(it.title, it.name));
        const r = await (await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd })).json();
        if (r.ok) return r;
      }
    } catch {}
  }
  return tg('sendDocument', { chat_id: chat, document: it.file, caption });
}

async function handle(m) {
  const id = m.from.id, chat = m.chat.id;
  const say = t => tg('sendMessage', { chat_id: chat, text: t });
  const text = (m.text || '').trim();
  const [c0, arg] = text.split(/\s+/), cmd = c0?.split('@')[0];

  // gros fichiers (>20 Mo) : lien du site -> /start f_<id>
  if (cmd === '/start') {
    const it = arg?.startsWith('f_') && await redis.hget('items', arg.slice(2));
    await redis.sadd('bu', String(id));   // utilisateurs du bot (pour les pubs)
    if (it) { await redis.hincrby('dls', it.id, 1); return sendBranded(chat, it); }
    await send(chat, PICS[Math.floor(Math.random() * PICS.length)],
      `👋 Bienvenue ${nm(m.from)} sur <b>H'es chop</b> !\n\nApps, fichiers et discussions : tout est dans la mini app ci-dessous.`);
    return (await isAdmin(id)) ? say(HELP) : undefined;
  }
  if (!await isAdmin(id)) return;
  const owner = String(id) === String(process.env.OWNER_ID);

  // pub : réponds à un message (photo + texte) avec /pub [lien] [texte du bouton]
  if (cmd === '/pub' && m.reply_to_message) {
    const users = await redis.smembers('bu');
    const kb = /^https?:\/\//.test(arg || '') ? { inline_keyboard: [[{ text: text.split(/\s+/).slice(2).join(' ') || 'Ouvrir', url: arg }]] } : undefined;
    let ok = 0;
    for (let i = 0; i < users.length; i += 25) {
      const r = await Promise.all(users.slice(i, i + 25).map(u => tg('copyMessage', { chat_id: u, from_chat_id: chat, message_id: m.reply_to_message.message_id, reply_markup: kb }).then(x => x.ok).catch(() => false)));
      ok += r.filter(Boolean).length;
      await new Promise(r => setTimeout(r, 1000));
    }
    return say(`📣 Pub envoyée à ${ok}/${users.length} utilisateurs`);
  }
  if (cmd === '/users') return say(`👥 ${await redis.scard('bu')} utilisateurs du bot`);
  if (cmd === '/badge') {
    const [, u, b] = text.split(/\s+/), n = (u || '').toLowerCase();
    if (!n || !['blue', 'gold', 'off'].includes(b)) return say('Usage : /badge pseudo blue|gold|off');
    if (!await redis.hexists('users', n)) return say('❌ Compte introuvable : ' + n);
    await (b === 'off' ? redis.hdel('badges', n) : redis.hset('badges', { [n]: b }));
    return say(`✅ Badge ${b} pour ${n}`);
  }
  if (cmd === '/badges') {
    const a = await redis.hgetall('badges') || {};
    return say(Object.entries(a).map(([k, v]) => `${k} — ${v}`).join('\n') || 'Aucun badge');
  }

  if (cmd === '/edit') {
    if (!arg || !await redis.hexists('items', arg)) return say('Usage : /edit id (voir /list), puis titre sur la ligne 1 et description en dessous');
    await redis.set('editing:' + id, arg, { ex: 600 });
    return say('✏️ Envoie le nouveau titre (ligne 1) puis la description. Envoie une photo en légende pour aussi changer l\'image.');
  }
  { // suite d'un /edit en cours
    const eid = await redis.get('editing:' + id);
    if (eid && (text || m.photo)) {
      const it = await redis.hget('items', eid);
      if (!it) { await redis.del('editing:' + id); }
      else {
        if (m.photo) it.photo = m.photo.at(-1).file_id;
        const src = m.caption || text;
        if (src) { const [title, ...desc] = src.split('\n'); it.title = title || it.title; it.desc = desc.join('\n') || it.desc; }
        await redis.hset('items', { [eid]: it }); await redis.del('editing:' + id);
        return say('✅ Publication mise à jour : ' + it.title);
      }
    }
  }
  if (cmd === '/restrict') {
    const [, rid, rb] = text.split(/\s+/);
    if (!rid || !['blue', 'gold', 'off'].includes(rb) || !await redis.hexists('items', rid)) return say('Usage : /restrict id blue|gold|off');
    await (rb === 'off' ? redis.hdel('restrict', rid) : redis.hset('restrict', { [rid]: rb }));
    return say(rb === 'off' ? '✅ Fichier accessible à tous' : `✅ Réservé au badge ${rb}`);
  }
  if (cmd === '/notify') {
    const msg = text.slice(8).trim();
    if (!msg) return say('Usage : /notify ton message');
    const nid = Date.now().toString(36);
    await redis.hset('notifs', { [nid]: { id: nid, text: msg, ts: Date.now() } });
    const users = await redis.smembers('bu');
    for (let i = 0; i < users.length; i += 25) {
      await Promise.all(users.slice(i, i + 25).map(u => tg('sendMessage', { chat_id: u, text: `🔔 ${msg}` }).catch(() => {})));
      await new Promise(r => setTimeout(r, 1000));
    }
    return say(`✅ Notification envoyée (site + ${users.length} utilisateurs Telegram)`);
  }
  if (cmd === '/ad') {
    const [, mode, ...rest] = text.split(/\s+/);
    if (mode === 'off') { await redis.del('ad'); return say('✅ Pub désactivée'); }
    if (mode === 'page') {
      const url = rest[0], delay = Math.max(0, Math.min(20, parseInt(rest[1]) || 5));
      if (!/^https?:\/\//.test(url || '')) return say('Usage : /ad page https://... délai(≤20s)');
      await redis.set('ad', { type: 'page', url, delay, ts: Date.now() });
      return say(`✅ Pub page activée (croix après ${delay}s)`);
    }
    if (mode === 'media') {
      const rp = m.reply_to_message;
      if (!rp) return say("Réponds à un message avec une photo et/ou une vidéo : /ad media délai lien texte");
      const delay = Math.max(0, Math.min(20, parseInt(rest[0]) || 5)), link = rest[1] || '', adText = rest.slice(2).join(' ');
      const put = async (file, mime, name) => { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); await redis.hset('media', { [k]: { k, file, mime, name, owner: 'admin' } }); return k; };
      const video = rp.video ? await put(rp.video.file_id, 'video/mp4', 'ad.mp4') : null;
      const photo = rp.photo ? await put(rp.photo.at(-1).file_id, 'image/jpeg', 'ad.jpg') : null;
      if (!video && !photo) return say('Le message ne contient ni photo ni vidéo');
      await redis.set('ad', { type: 'media', video, photo, link, text: adText, delay, ts: Date.now() });
      return say(`✅ Pub média activée (croix après ${delay}s)`);
    }
    return say('Usage : /ad off · /ad page url délai · /ad media délai lien texte (en réponse à une photo/vidéo)');
  }

  // réponse à un commentaire reçu
  const rp = m.reply_to_message;
  if (rp) {
    const cid = await redis.get(`nm:${chat}:${rp.message_id}`);
    const c = cid && await redis.hget('cm', String(cid));
    if (c) {
      if (cmd === '/del') { await redis.hdel('cm', c.id); return say('🗑 Commentaire supprimé'); }
      if (text) { await redis.hset('cm', { [c.id]: { ...c, reply: text.slice(0, 500) } }); return say('✅ Réponse publiée sur le site'); }
    }
  }

  if (cmd === '/addadmin' && owner && /^\d+$/.test(arg || ''))
    return redis.sadd('admins', arg).then(() => say(`✅ Admin ajouté : ${arg}\n(il doit faire /start sur le bot pour recevoir les commentaires)`));
  if (cmd === '/rmadmin' && owner) return redis.srem('admins', arg).then(() => say('✅ Admin retiré'));
  if (cmd === '/admins') return say((await admins()).join('\n'));
  if (cmd === '/list') {
    const a = Object.values(await redis.hgetall('items') || {});
    return say(a.map(i => `${i.id} — ${i.title}`).join('\n') || 'Aucune publication');
  }
  if (cmd === '/upload' && !arg) {
    const todo = Object.values(await redis.hgetall('items') || {}).filter(i => !i.blob && (Number(i.size) > 19e6 || !i.size));
    if (!todo.length) return say('✅ Rien à envoyer : tous les fichiers sont déjà en téléchargement direct (ou font moins de 20 Mo).');
    for (const i of todo.slice(0, 15)) await say(`📤 ${i.title} (ID ${i.id})\n${await upLink(i.id)}`);
    return say('Ouvre chaque lien (valable 1 h) et choisis le fichier correspondant sur ton téléphone.');
  }
  if (cmd === '/upload') {
    if (!arg || !await redis.hexists('items', arg)) return say('Usage : /upload id (voir /list)');
    return say(`📤 Ouvre ce lien (valable 1 h) pour envoyer le fichier sur le site :\n${await upLink(arg)}`);
  }
  if (cmd === '/del' && arg) {
    const old = await redis.hget('items', arg);
    if (old?.blob) await delBlob(old.blob);
    const n = await redis.hdel('items', arg);
    await redis.hdel('likes', arg); await redis.del('lk:' + arg); await redis.hdel('rat', arg); await redis.del('rv:' + arg);
    return say(n ? '🗑 Publication supprimée' : '❌ ID introuvable (voir /list)');
  }
  if (cmd === '/chat' && text.length > 6) {
    const cid = Date.now().toString(36);
    await redis.hset('chm', { [cid]: { id: cid, name: 'Admin', text: text.slice(6).trim().slice(0, 300), ts: Date.now(), admin: true } });
    return say('✅ Envoyé dans le chat');
  }
  if (cmd === '/clearchat') return redis.del('chm').then(() => say('🧹 Chat vidé'));

  if (m.photo) {
    const fid = m.photo.at(-1).file_id, d = await redis.get('draft:' + id);
    if (d && !m.caption) {   // photos suivantes (sans légende) = captures d'écran de l'app
      d.shots = [...(d.shots || []), fid].slice(0, 8);
      await redis.set('draft:' + id, d, { ex: 3600 });
      return say(`🖼 Capture ${d.shots.length} ajoutée. Envoie d'autres photos ou le fichier / APK.`);
    }
    const [title, ...desc] = (m.caption || '').split('\n');
    await redis.set('draft:' + id, { photo: fid, title: title || 'Sans titre', desc: desc.join('\n'), shots: [] }, { ex: 3600 });
    return say('📎 Photo principale reçue. Envoie des captures (photos sans légende) si tu veux, puis le fichier / APK.');
  }
  if (m.document) {
    const d = await redis.get('draft:' + id);
    if (!d) return say("Envoie d'abord une photo avec en légende : titre puis description.");
    const it = { id: Date.now().toString(36), ...d, file: m.document.file_id, name: m.document.file_name, size: m.document.file_size, ts: Date.now() };
    await redis.hset('items', { [it.id]: it });
    await redis.del('draft:' + id);
    if (it.size > 19e6) return say(`✅ Publié : ${it.title}\nID : ${it.id}\n\n⚠️ Fichier de plus de 20 Mo : pour qu'il se télécharge directement sur le site (au lieu de passer par Telegram), envoie-le ici (lien valable 1 h) :\n${await upLink(it.id)}`);
    return say(`✅ Publié sur le site : ${it.title}\nID : ${it.id}`);
  }
  return say(HELP);
}

export default async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const m = req.body?.message;
  if (m?.new_chat_members || m?.left_chat_member) await group(m).catch(console.error);
  else if (m?.chat?.type === 'private') await handle(m).catch(e => {
    console.error(e);
    if (String(m.from.id) === String(process.env.OWNER_ID)) return tg('sendMessage', { chat_id: m.chat.id, text: '⚠️ Erreur : ' + e.message });
  });
  res.status(200).end();
};
