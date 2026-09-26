import { randomBytes } from 'node:crypto';
import { redis, tg, admins, isAdmin, BRAND, brandName } from '../lib/db.js';
const siteUrl = () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/$/, '');
const delBlob = async u => { try { const { del } = await import('@vercel/blob'); await del(u); } catch {} };
import { PICS, WELCOME_PIC } from '../lib/pics.js';
import { pushToAll } from '../lib/push.js';
const pick = () => PICS[Math.floor(Math.random() * PICS.length)] || WELCOME_PIC;
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
💡 Ou écris [gold] ou [blue] dans le titre (ligne 1 de la légende de la photo) : le fichier est réservé à ce badge dès la publication.
/upload — liens pour envoyer sur le site tous les gros fichiers (>20 Mo) pas encore en téléchargement direct
/upload id — idem pour un seul fichier
/notify texte — notification envoyée à tous (site + Telegram). Ajoute une photo en légende, ou réponds à une photo avec /notify texte, pour l'inclure.
/ad off — désactiver la pub du site
/ad page url délai — pub plein écran = ta page d'accueil, croix/Skip après le délai (en secondes, sans plafond)
/ad media délai lien texte — en réponse à une photo/vidéo : pub média plein écran sur le site (délai en secondes, sans plafond)
/help — aide rapide (liste des commandes, sans les explications)
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

const seg = t => ({ t });
const link = (t, url) => ({ t, url });
const pemo = t => ({ t, emoji: true });

const PREMIUM_EMOJI = {
  '🎉': '6073355211362016920',
  '📣': '6073260150850854146',
  '🔔': '6073139054247944123',
  '➕': '6073215715119211263',
  '📢': '6073425180674235088',
};

function compose(segments) {
  let text = '', entities = [];
  for (const s of segments) {
    const start = text.length;
    text += s.t;
    if (s.url) entities.push({ type: 'text_link', offset: start, length: s.t.length, url: s.url });
    if (s.emoji && PREMIUM_EMOJI[s.t]) entities.push({ type: 'custom_emoji', offset: start, length: s.t.length, custom_emoji_id: PREMIUM_EMOJI[s.t] });
  }
  return { text, entities };
}

async function sendFramed(chat, photoRef, segments) {
  const { text, entities } = compose(segments);
  if (photoRef) {
    const isAnim = /\.(gif|mp4)$/i.test(typeof photoRef === 'string' ? photoRef : '');
    const meth = isAnim ? 'sendAnimation' : 'sendPhoto', key = isAnim ? 'animation' : 'photo';
    const p = { chat_id: chat, [key]: photoRef, caption: text, reply_markup: BTN };
    if (entities.length) p.caption_entities = entities;
    const r = await tg(meth, p);
    if (r.ok) return r;
  }
  const p = { chat_id: chat, text, reply_markup: BTN };
  if (entities.length) p.entities = entities;
  return tg('sendMessage', p);
}

const CMDS = [
  ['📋', '/list'], ['🗑', '/del'], ['💬', '/chat'], ['🧹', '/clearchat'], ['📣', '/pub'],
  ['🏷', '/badge'], ['🎖', '/badges'], ['✏️', '/edit'], ['🔒', '/restrict'], ['📤', '/upload'],
  ['🔔', '/notify'], ['📢', '/ad'], ['👮', '/admins'], ['➕', '/addadmin'], ['➖', '/rmadmin'],
];
const welcomeSegments = u => [
  seg("╭▱▱ 𝚆𝙴𝙻𝙲𝙾𝙼𝙴 ▱▱ "), pemo('🎉'), seg("\n┃≫ "),
  link(u.first_name || 'Membre', `tg://user?id=${u.id}`),
  seg("\n╰▱▱▱▱▱▱▱▱\n≪ 𝚃𝙷𝙴 𝙷'𝙴𝚂 𝚂𝙷𝙾𝙿 "), pemo('🛒'), seg('≫'),
];
const goodbyeSegments = u => [
  seg("╭▱▱ 𝙶𝙾𝙾𝙳𝙱𝚈𝙴 ▱▱ "), pemo('👋'), seg("\n┃≫ "),
  link(u.first_name || 'Membre', `tg://user?id=${u.id}`),
  seg("\n╰▱▱▱▱▱▱▱▱\n≪ 𝚃𝙷𝙴 𝙷'𝙴𝚂 𝚂𝙷𝙾𝙿 "), pemo('🛒'), seg('≫'),
];

async function personPhotoFileId(u) {
  try {
    const p = await tg('getUserProfilePhotos', { user_id: u.id, limit: 1 });
    if (p.ok && p.result.total_count > 0) return p.result.photos[0].at(-1).file_id;
  } catch {}
  return null;
}

async function group(m) {
  for (const u of m.new_chat_members || []) {
    if (u.is_bot) continue;
    const fid = await personPhotoFileId(u);
    const r = await sendFramed(m.chat.id, fid || pick(), welcomeSegments(u));
    if (!r.ok) await send(m.chat.id, pick(), `🎉 Bienvenue ${nm(u)} dans <b>${esc(m.chat.title)}</b> !\nPasse par notre boutique 👇`);
  }
  const l = m.left_chat_member;
  if (l && !l.is_bot) {
    const fid = await personPhotoFileId(l);
    const r = await sendFramed(m.chat.id, fid || pick(), goodbyeSegments(l));
    if (!r.ok) await tg('sendMessage', { chat_id: m.chat.id, parse_mode: 'HTML', text: `👋 ${nm(l)} a quitté le groupe. À bientôt !`, reply_markup: BTN });
  }
}

async function upLink(item) {
  const tok = randomBytes(16).toString('hex');
  await redis.set('upt:' + tok, { item }, { ex: 3600 });
  return `${siteUrl()}/upload.html?k=${tok}`;
}

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
  const capText = (m.caption || '').trim();
  const [cc0] = capText.split(/\s+/), captionCmd = cc0?.split('@')[0];

  if (cmd === '/start') {
    const it = arg?.startsWith('f_') && await redis.hget('items', arg.slice(2));
    await redis.sadd('bu', String(id));
    if (it) { await redis.hincrby('dls', it.id, 1); return sendBranded(chat, it); }
    if (await isAdmin(id)) return sendFramed(chat, pick(), helpSegments());
    return send(chat, pick(),
      `👋 Bienvenue ${nm(m.from)} sur <b>H'es chop</b> !\n\nApps, fichiers et discussions : tout est dans la mini app ci-dessous.`);
  }
  if (cmd === '/link') {
    await redis.sadd('bu', String(id));
    return tg('sendMessage', {
      chat_id: chat,
      text: `🔗 <b>H'es Store</b>\n${siteUrl()}/`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🌐 Ouvrir le site', url: siteUrl() + '/' }]] },
    });
  }
  if (!await isAdmin(id)) return;
  const owner = String(id) === String(process.env.OWNER_ID);

  if (cmd === '/help') return sendFramed(chat, null, helpSegments());

  if (cmd === '/emojiset') {
    if (!arg) return say("Usage : /emojiset nomDuPack\n(le nom après /addemoji/ dans le lien du pack, ex: GiftForEditfinity)");
    const r = await tg('getStickerSet', { name: arg });
    if (!r.ok) return say('❌ Pack introuvable : ' + arg);
    const lines = r.result.stickers.map(s => `${s.emoji || '❔'} — ${s.custom_emoji_id}`);
    if (!lines.length) return say('Ce pack ne contient aucun emoji');
    for (let i = 0; i < lines.length; i += 50) await say(lines.slice(i, i + 50).join('\n'));
    return;
  }

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
  {
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
  if (cmd === '/notify' || captionCmd === '/notify') {
    const raw = cmd === '/notify' ? text.slice(8) : capText.replace(/^\/notify(@\w+)?\s*/i, '');
    const msg = raw.trim();
    if (!msg) return say("Usage : /notify ton message (ajoute une photo en légende, ou réponds à une photo avec /notify ton message, pour l'inclure)");
    let photoUrl = null;
    const srcPhoto = m.photo || m.reply_to_message?.photo;
    if (srcPhoto) {
      const fid = srcPhoto.at(-1).file_id;
      const pk = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await redis.hset('media', { [pk]: { k: pk, file: fid, mime: 'image/jpeg', name: 'notif.jpg', owner: 'admin' } });
      photoUrl = `${siteUrl()}/api/media?k=${pk}`;
    }
    const nid = Date.now().toString(36);
    await redis.hset('notifs', { [nid]: { id: nid, text: msg, ts: Date.now(), ...(photoUrl ? { photo: photoUrl } : {}) } });
    const users = await redis.smembers('bu');
    for (let i = 0; i < users.length; i += 25) {
      await Promise.all(users.slice(i, i + 25).map(u => (photoUrl
        ? tg('sendPhoto', { chat_id: u, photo: photoUrl, caption: `🔔 ${msg}` })
        : tg('sendMessage', { chat_id: u, text: `🔔 ${msg}` })
      ).catch(() => {})));
      await new Promise(r => setTimeout(r, 1000));
    }
    const p = await pushToAll({
      title: "H'es Store",
      body: msg,
      url: siteUrl() + '/',
      ...(photoUrl ? { image: photoUrl } : {}),
      actions: [{ action: 'open', title: 'Ouvrir' }, { action: 'dismiss', title: 'Fermer' }],
    }).catch(() => ({ ok: 0, total: 0 }));
    return say(`✅ Notification envoyée (site + ${users.length} utilisateurs Telegram + ${p.ok}/${p.total} navigateurs)${photoUrl ? ' 🖼' : ''}`);
  }
  if (cmd === '/ad') {
    // Note : le délai n'est plus plafonné à 20 s, il est envoyé tel quel au site (Math.max(0, ...) uniquement, pas de min()).
    const [, mode, ...rest] = text.split(/\s+/);
    if (mode === 'off') { await redis.del('ad'); return say('✅ Pub désactivée'); }
    if (mode === 'page') {
      const url = rest[0], delay = Math.max(0, parseInt(rest[1]) || 5);
      if (!/^https?:\/\//.test(url || '')) return say('Usage : /ad page https://... délai (en secondes, sans plafond)');
      await redis.set('ad', { type: 'page', url, delay, ts: Date.now() });
      return say(`✅ Pub plein écran (page) activée — Skip possible après ${delay}s`);
    }
    if (mode === 'media') {
      const rp = m.reply_to_message;
      if (!rp) return say("Réponds à un message avec une photo et/ou une vidéo : /ad media délai lien texte");
      const delay = Math.max(0, parseInt(rest[0]) || 5), link_ = rest[1] || '', adText = rest.slice(2).join(' ');
      const put = async (file, mime, name) => { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); await redis.hset('media', { [k]: { k, file, mime, name, owner: 'admin' } }); return k; };
      const video = rp.video ? await put(rp.video.file_id, 'video/mp4', 'ad.mp4') : null;
      const photo = rp.photo ? await put(rp.photo.at(-1).file_id, 'image/jpeg', 'ad.jpg') : null;
      if (!video && !photo) return say('Le message ne contient ni photo ni vidéo');
      await redis.set('ad', { type: 'media', video, photo, link: link_, text: adText, delay, ts: Date.now() });
      return say(`✅ Pub plein écran (média) activée — Skip possible après ${delay}s`);
    }
    return say('Usage : /ad off · /ad page url délai · /ad media délai lien texte (en réponse à une photo/vidéo) — délai en secondes, sans plafond');
  }

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
    if (d && !m.caption) {
      d.shots = [...(d.shots || []), fid].slice(0, 8);
      await redis.set('draft:' + id, d, { ex: 3600 });
      return say(`🖼 Capture ${d.shots.length} ajoutée. Envoie d'autres photos ou le fichier / APK.`);
    }
    const [rawTitle, ...desc] = (m.caption || '').split('\n');
    const tag = /\[(gold|blue)\]/i.exec(rawTitle || ''), title = (rawTitle || '').replace(/\s*\[(gold|blue)\]\s*/ig, ' ').trim();
    await redis.set('draft:' + id, { photo: fid, title: title || 'Sans titre', desc: desc.join('\n'), shots: [], ...(tag ? { need: tag[1].toLowerCase() } : {}) }, { ex: 3600 });
    return say('📎 Photo principale reçue' + (tag ? ` (fichier réservé au badge ${tag[1].toLowerCase()})` : '') + '. Envoie des captures (photos sans légende) si tu veux, puis le fichier / APK.');
  }
  if (m.document) {
    const d = await redis.get('draft:' + id);
    if (!d) return say("Envoie d'abord une photo avec en légende : titre puis description.");
    const { need, ...rest } = d;
    const it = { id: Date.now().toString(36), ...rest, file: m.document.file_id, name: m.document.file_name, size: m.document.file_size, ts: Date.now() };
    await redis.hset('items', { [it.id]: it });
    if (need) await redis.hset('restrict', { [it.id]: need });
    await redis.del('draft:' + id);
    return say(`✅ Publié sur le site : ${it.title}\nID : ${it.id}${need ? `\n🔒 Réservé au badge ${need}${need === 'blue' ? ' (les gold peuvent aussi le télécharger)' : ''}` : ''}`);
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
