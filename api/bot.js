import { redis, tg, admins, isAdmin, BRAND, brandName, siteUrl } from '../lib/db.js';
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
/restrict id blue|gold|off — réserver un fichier aux détenteurs d'un badge
/notify texte — notification envoyée à tous (site + Telegram)
/ad off — désactiver toutes les pubs
/ad list — voir les pubs actives (avec leur id)
/ad del id — supprimer une seule pub
/ad page url délai — ajoute une pub plein écran = une page web, croix/Skip après le délai (en secondes)
/ad media délai lien texte — en réponse à une photo/vidéo : ajoute une pub média plein écran
Plusieurs pubs peuvent être actives en même temps : chaque /ad page ou /ad media EN AJOUTE une nouvelle (elle ne remplace pas les autres), et le site en choisit une au hasard à chaque fois, en plus de les afficher toutes dans la liste des applications.
🎬 Tutos : envoie une VIDÉO avec en légende le titre (ligne 1) puis la description. Envoie ensuite une photo SANS légende = couverture (sinon la vignette de la vidéo est utilisée). Puis /tuto pour publier.
/tuto — publier le tuto en préparation (peut être suivi d'un nouveau titre + description sur 2 lignes)
/tutoannuler — annuler le tuto en préparation
/tutos — voir les tutos
/tutodel ID — supprimer un tuto
/lien — lien de la mini app avec une photo au hasard (tout le monde, aussi dans les groupes)
/ok ID · /no ID — valider / refuser une demande d'ajout (ou utilise les boutons ✅ ❌)
/admins — voir les admins
/addadmin ID · /rmadmin ID (propriétaire)

📥 Les demandes d'ajout envoyées depuis le site (avec le fichier et les captures déjà joints) arrivent ici directement avec les boutons ✅ Valider / ❌ Refuser.
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
const pick = () => PICS[Math.floor(Math.random() * PICS.length)] || WELCOME_PIC;   // photo du bot au hasard

/* ================= cadres « NOUVELLE CHAÎNE » ================= *
 * compose() fabrique le texte + ses entities Telegram (mention, lien, emoji premium) sans parse_mode. */
const mono = s => [...String(s)].map(c => {   // lettres en police « monospace » (𝚆𝙴𝙻𝙲𝙾𝙼𝙴, 𝚕𝚒𝚗𝚔…)
  const k = c.charCodeAt(0);
  if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D670 + k - 65);
  if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D68A + k - 97);
  if (k >= 48 && k <= 57) return String.fromCodePoint(0x1D7F6 + k - 48);
  return c;
}).join('');
const seg = t => ({ t });
const link = (t, url) => ({ t, url });
const who = u => ({ t: u.first_name || 'Membre', uid: u.id });
const pemo = t => ({ t, emoji: true });
const PREMIUM_EMOJI = { '🎉': '6073355211362016920' };   // emoji Telegram Premium (les autres restent des emojis normaux)

function compose(segments) {
  let text = '', entities = [];
  for (const s of segments) {
    const start = text.length;   // JS compte en unités UTF-16, comme Telegram
    text += s.t;
    if (s.uid) entities.push({ type: 'text_mention', offset: start, length: s.t.length, user: { id: s.uid } });
    if (s.url) entities.push({ type: 'text_link', offset: start, length: s.t.length, url: s.url });
    if (s.emoji && PREMIUM_EMOJI[s.t]) entities.push({ type: 'custom_emoji', offset: start, length: s.t.length, custom_emoji_id: PREMIUM_EMOJI[s.t] });
  }
  return { text, entities };
}
async function sendFramed(chat, photoRef, segments) {
  const { text, entities } = compose(segments);
  if (photoRef) {
    const p = { chat_id: chat, photo: photoRef, caption: text, reply_markup: BTN };
    if (entities.length) p.caption_entities = entities;
    const r = await tg('sendPhoto', p);
    if (r.ok) return r;
  }
  const p = { chat_id: chat, text, reply_markup: BTN };
  if (entities.length) p.entities = entities;
  return tg('sendMessage', p);
}
const frame = (title, emoji, body) => [
  seg(`╭▱▱ ${mono(title)} ▱▱ `), ...(emoji ? [pemo(emoji)] : []), seg('\n┃≫ '), ...body,
  seg(`\n╰▱▱▱▱▱▱▱▱\n≪ ${mono("THE H'ES SHOP")} `), pemo('🛒'), seg('≫'),
];
const welcomeSegs = u => frame('WELCOME', '🎉', [who(u)]);
const byeSegs = u => frame('GOODBYE', '👋', [who(u)]);
const linkSegs = () => frame('link', '', [link(SHOP, SHOP)]);

// photo de profil de la personne (arrive / part) ; sinon photo du bot au hasard
async function memberPic(u) {
  try { const p = await tg('getUserProfilePhotos', { user_id: u.id, limit: 1 }); if (p.ok && p.result.total_count > 0) return p.result.photos[0].at(-1).file_id; } catch {}
  return null;
}

// bienvenue / au revoir dans les groupes
async function group(m) {
  for (const u of m.new_chat_members || []) {
    if (u.is_bot) continue;
    await trackMember(m.chat.id, u);
    await sendFramed(m.chat.id, (await memberPic(u)) || pick(), welcomeSegs(u));
  }
  const l = m.left_chat_member;
  if (l && !l.is_bot) { await redis.hdel('grpmem:' + m.chat.id, l.id).catch(() => {}); await sendFramed(m.chat.id, (await memberPic(l)) || pick(), byeSegs(l)); }
}

// /lien : lien de la mini app + photo au hasard
const lien = chat => sendFramed(chat, pick(), linkSegs());

/* ================= liste de commandes en citation (comme /start), avec /commandes cliquables ================= */
const HELP_CMDS = ['/list', '/del', '/chat', '/clearchat', '/pub', '/users', '/badge', '/badges', '/edit', '/restrict', '/notify', '/ad', '/lien', '/tagall', '/tuto', '/tutos', '/tutodel', '/tutoannuler', '/ok', '/no', '/admins', '/addadmin', '/rmadmin'];
const utf16len = s => String(s).length;   // les chaînes JS sont déjà en unités UTF-16, comme les offsets Telegram
function helpQuotedText() {
  const lines = HELP_CMDS.map(c => `┃≫ ${c}`).join('\n');
  return `╭▱▱ ${mono('COMMANDES')} ▱▱\n${lines}\n╰▱▱▱▱▱▱▱▱\n≪ ${mono("THE H'ES SHOP")} 🛒≫`;
}
function helpEntities(text) {
  const out = [{ type: 'expandable_blockquote', offset: 0, length: utf16len(text) }];
  for (const m of String(text).matchAll(/\/[a-z][a-z0-9_]*/gi))
    out.push({ type: 'bot_command', offset: utf16len(text.slice(0, m.index)), length: utf16len(m[0]) });
  return out;
}
function sendHelp(chat) {
  const text = helpQuotedText();
  return tg('sendMessage', { chat_id: chat, text, entities: helpEntities(text), reply_markup: BTN });
}

/* ================= /tagall : mentionne tout le monde dans un groupe ================= *
 * Telegram ne donne pas la liste complète des membres à un bot, donc on la construit nous-mêmes :
 * chaque fois que quelqu'un écrit ou rejoint un groupe suivi, on note son id dans grpmem:<chatId>. */
async function trackMember(chatId, u) {
  if (!u || u.is_bot) return;
  try { await redis.hset('grpmem:' + chatId, { [u.id]: { id: u.id, name: u.first_name || 'Membre', user: u.username || '' } }); } catch {}
}

async function tagAll(m) {
  const chat = m.chat.id;
  if (await limit('rl:tagall:' + chat, 1, 20)) return tg('sendMessage', { chat_id: chat, text: '⏳ Attends un peu avant de refaire /tagall.' });
  const mem = Object.values(await redis.hgetall('grpmem:' + chat) || {});
  if (!mem.length) return tg('sendMessage', { chat_id: chat, text: "Aucun membre suivi pour l'instant : la liste se remplit au fur et à mesure que les gens écrivent ou rejoignent le groupe." });

  // photo : celle de la personne qui lance /tagall, sinon la photo du groupe, sinon une photo du bot au hasard
  let photo = null;
  try { const p = await tg('getUserProfilePhotos', { user_id: m.from.id, limit: 1 }); if (p.ok && p.result.total_count > 0) photo = p.result.photos[0].at(-1).file_id; } catch {}
  if (!photo) { try { const c = await tg('getChat', { chat_id: chat }); if (c.ok && c.result.photo) photo = c.result.photo.big_file_id; } catch {} }
  if (!photo) photo = pick();

  const CHUNK = 20, launcher = m.from.first_name || "Quelqu'un";
  const chunks = []; for (let i = 0; i < mem.length; i += CHUNK) chunks.push(mem.slice(i, i + CHUNK));

  for (let ci = 0; ci < chunks.length; ci++) {
    const group_ = chunks[ci];
    // construit le texte + les entities ensemble, comme compose() : jamais d'offset devinés à la main
    let text = '', entities = [];
    const put = (t, ent) => { const start = utf16len(text); text += t; if (ent) entities.push({ ...ent, offset: start, length: utf16len(t) }); };
    if (ci === 0) {
      put(`╭▱▱ ${mono('TAGALL')} ▱▱\n┃≫ `);
      put(mono(launcher));
      put(` appelle tout le monde 📣\n`);
    } else put('┃\n');
    for (const u of group_) { put('┃≫ '); put(u.name || 'Membre', { type: 'text_mention', user: { id: u.id } }); put('\n'); }
    if (ci === chunks.length - 1) {
      put(`╰▱▱▱▱▱▱▱▱\n≪ `);
      put(mono("THE H'ES SHOP"));
      put(` 🛒≫`);
    }
    entities.unshift({ type: 'expandable_blockquote', offset: 0, length: utf16len(text) });

    if (ci === 0) {
      const r = text.length <= 1024
        ? await tg('sendPhoto', { chat_id: chat, photo, caption: text, caption_entities: entities }).catch(() => ({ ok: false }))
        : { ok: false };
      if (!r.ok) {
        await tg('sendPhoto', { chat_id: chat, photo }).catch(() => {});
        await tg('sendMessage', { chat_id: chat, text, entities }).catch(() => {});
      }
    } else {
      await tg('sendMessage', { chat_id: chat, text, entities }).catch(() => {});
    }
  }
}

/* ================= demandes d'ajout envoyées depuis le site ================= */
async function uploadPhoto(chat, dataUrl, caption, markup) {   // envoie l'icône (data URL) et renvoie la réponse Telegram (avec son file_id)
  try {
    const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    const fd = new FormData();
    fd.append('chat_id', String(chat)); fd.append('caption', caption);
    if (markup) fd.append('reply_markup', JSON.stringify(markup));
    fd.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'icon.jpg');
    return await (await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd })).json();
  } catch { return { ok: false }; }
}

async function subStart(m, sid) {   // /start sub_<id> : l'utilisateur vient du site (ancien parcours, encore utilisable en secours)
  const say = t => tg('sendMessage', { chat_id: m.chat.id, text: t });
  const sub = await redis.get('sub:' + sid);
  if (!sub || sub.done) return say("❌ Cette demande a expiré ou a déjà été traitée. Recommence depuis le site (page « + »).");
  if (sub.file) return say('✅ Cette demande a déjà été envoyée aux admins avec son fichier, rien à faire ici.');
  await redis.set('subwait:' + m.from.id, sid, { ex: 3600 });
  return say(`📎 « ${sub.name} »\n\nEnvoie-moi maintenant le fichier (APK, ZIP, TXT…) comme document. Les admins vont le vérifier avant de le publier.`);
}

async function subFile(m, sid) {   // l'utilisateur envoie le fichier : tout part vers les admins (ancien parcours, encore utilisable en secours)
  const id = m.from.id, say = t => tg('sendMessage', { chat_id: m.chat.id, text: t });
  const sub = await redis.get('sub:' + sid);
  if (!sub || sub.done) { await redis.del('subwait:' + id); return say('❌ Demande expirée. Recommence depuis le site.'); }
  if (!m.document) return say('📎 Envoie-le comme fichier (trombone → Fichier), pas comme photo ou vidéo.');
  const list = await admins();
  if (!list.length) return say("⚠️ Aucun admin disponible pour le moment, réessaie plus tard.");
  sub.file = m.document.file_id; sub.fileName = m.document.file_name || 'file'; sub.size = m.document.file_size || 0;
  sub.tg = { id, name: m.from.first_name || '', user: m.from.username || '' };
  const tgu = [m.from.first_name, m.from.username && '@' + m.from.username, id].filter(Boolean).join(' ');
  sub.cap = `📥 Nouvelle demande d'ajout\n\n${sub.type === 'file' ? '📄 Fichier' : '📱 Application'} : ${sub.name}\n📝 ${String(sub.desc).slice(0, 450)}\n\n👤 Compte du site : ${sub.by}\n✈️ Telegram : ${tgu}\n📎 ${sub.fileName} (${(sub.size / 1048576).toFixed(1)} Mo)\n\nID : ${sid} — /ok ${sid} · /no ${sid}`;
  const kb = { inline_keyboard: [[{ text: '✅ Valider', callback_data: 'sa:' + sid }, { text: '❌ Refuser', callback_data: 'sr:' + sid }]] };
  sub.msgs = [];
  for (const a of list) {
    let r;
    if (sub.iconFid) r = await tg('sendPhoto', { chat_id: a, photo: sub.iconFid, caption: sub.cap, reply_markup: kb });
    else {
      r = await uploadPhoto(a, sub.icon, sub.cap, kb);
      const ph = r?.result?.photo; if (ph) sub.iconFid = ph.at(-1).file_id;
    }
    if (!r?.ok) r = await tg('sendMessage', { chat_id: a, text: sub.cap, reply_markup: kb });
    if (r?.ok) sub.msgs.push({ chat: a, mid: r.result.message_id });
    await tg('sendDocument', { chat_id: a, document: sub.file, caption: `📎 ${sub.fileName} — demande ${sid}` }).catch(() => {});
  }
  if (sub.iconFid) delete sub.icon;   // l'icône est maintenant chez Telegram
  await redis.set('sub:' + sid, sub, { ex: 604800 });
  await redis.del('subwait:' + id);
  return say("✅ Reçu ! Ta demande a été envoyée aux admins. Tu seras prévenu ici dès qu'elle est validée.");
}

// Étape rapide : ne fait que les opérations Redis (toujours rapides), pour pouvoir répondre au clic
// immédiatement même s'il y a plusieurs admins — avant, tout attendait la mise à jour de CHAQUE message
// admin (plusieurs appels Telegram en série) avant de répondre, ce qui pouvait dépasser le délai que
// Telegram accorde à un bouton et le faisait paraître « bloqué » sans jamais valider.
async function decide(sid, ok, admin) {
  const sub = await redis.get('sub:' + sid);
  if (!sub) return { msg: '❌ Demande introuvable ou expirée' };
  if (sub.done) return { msg: '⚠️ Déjà traitée' };
  if (!sub.file) return { msg: "⏳ L'utilisateur n'a pas encore envoyé le fichier" };
  sub.done = ok ? 'ok' : 'no';
  let itemId = '';
  if (ok) {
    itemId = Date.now().toString(36);
    await redis.hset('items', { [itemId]: { id: itemId, title: sub.name, desc: sub.desc, photo: sub.iconFid, shots: sub.shots || [], file: sub.file, name: sub.fileName, size: sub.size, ts: Date.now(), by: sub.by, kind: sub.type } });
  }
  await redis.set('sub:' + sid, sub, { ex: 86400 });
  const msg = ok ? `✅ Publié : ${sub.name} (ID ${itemId})` : `🗑 Refusé : ${sub.name}`;
  return { msg, sub, ok };
}

// Étape lente : nettoyage (retire les boutons chez tous les admins, prévient l'auteur) — faite APRÈS avoir répondu au clic
async function decideCleanup(sub, ok, admin) {
  const status = `${ok ? '✅ Validé' : '❌ Refusé'} par ${admin?.first_name || 'un admin'}`;
  await Promise.allSettled((sub.msgs || []).map(x =>
    tg('editMessageCaption', { chat_id: x.chat, message_id: x.mid, caption: `${sub.cap || sub.name}\n\n${status}`, reply_markup: { inline_keyboard: [] } })
      .then(r => r.ok ? r : tg('editMessageText', { chat_id: x.chat, message_id: x.mid, text: `${sub.cap || sub.name}\n\n${status}`, reply_markup: { inline_keyboard: [] } }))
  ));
  if (sub.tg?.id) await tg('sendMessage', { chat_id: sub.tg.id, text: ok ? `✅ « ${sub.name} » a été validé et publié sur le site !` : `❌ Ta demande « ${sub.name} » n'a pas été acceptée.` }).catch(() => {});
}

// Utilisé par /ok et /no (pas pressés par un délai de bouton, donc on peut tout attendre d'un coup)
async function decideAndNotify(sid, ok, admin) {
  const result = await decide(sid, ok, admin);
  if (result.sub) await decideCleanup(result.sub, result.ok, admin).catch(() => {});
  return result.msg;
}

async function callback(cq) {
  const data = cq.data || '';
  if (!/^s[ar]:/.test(data)) return tg('answerCallbackQuery', { callback_query_id: cq.id });
  if (!await isAdmin(cq.from.id)) return tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Réservé aux admins', show_alert: true });
  const sid = data.slice(3), ok = data[1] === 'a';
  let result;
  try { result = await decide(sid, ok, cq.from); }
  catch (e) { console.error(e); return tg('answerCallbackQuery', { callback_query_id: cq.id, text: '⚠️ Erreur, réessaie', show_alert: true }); }
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: result.msg.slice(0, 180) });   // répond au clic tout de suite
  if (result.sub) decideCleanup(result.sub, result.ok, cq.from).catch(console.error);   // puis nettoie, sans faire attendre le bouton
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

  if (cmd === '/start') {
    await redis.sadd('bu', String(id));   // utilisateurs du bot (pour les pubs)
    if (arg?.startsWith('sub_')) return subStart(m, arg.slice(4));   // demande d'ajout venue du site (ancien parcours)
    const it = arg?.startsWith('f_') && await redis.hget('items', arg.slice(2));   // gros fichiers (>20 Mo) : lien du site
    if (it) { await redis.hincrby('dls', it.id, 1); return sendBranded(chat, it); }
    await send(chat, pick(),
      `👋 Bienvenue ${nm(m.from)} sur <b>H'es chop</b> !\n\nApps, fichiers et discussions : tout est dans la mini app ci-dessous.`);
    return (await isAdmin(id)) ? sendHelp(chat) : undefined;
  }

  // fichier d'une demande d'ajout à l'ancienne (utilisateur qui vient du site sans upload direct)
  const wait = await redis.get('subwait:' + id);
  if (wait && (m.document || m.photo || m.video || m.audio || m.voice)) return subFile(m, wait);
  if (wait && text && !text.startsWith('/') && !await isAdmin(id)) return say("📎 J'attends ton fichier : envoie-le comme document (trombone → Fichier).");

  if (!await isAdmin(id)) return;
  const owner = String(id) === String(process.env.OWNER_ID);

  if (cmd === '/help') return say(HELP);
  if (cmd === '/ok' || cmd === '/no') return say(arg ? await decideAndNotify(arg, cmd === '/ok', m.from) : 'Usage : /ok ID ou /no ID');

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
    if (mode === 'off') { await redis.del('ads'); return say('✅ Toutes les pubs sont désactivées'); }
    if (mode === 'list') {
      const all = Object.values(await redis.hgetall('ads') || {});
      if (!all.length) return say('Aucune pub active. Ajoute-en une avec /ad page ou /ad media.');
      return say(all.map(a => `${a.id} — ${a.type}${a.type === 'page' ? ' · ' + a.url : (a.text ? ' · ' + a.text.slice(0, 40) : '')} (skip ${a.delay}s)`).join('\n'));
    }
    if (mode === 'del') {
      if (!rest[0]) return say('Usage : /ad del id (voir /ad list)');
      const n = await redis.hdel('ads', rest[0]);
      return say(n ? '🗑 Pub supprimée' : '❌ Id introuvable (voir /ad list)');
    }
    if (mode === 'page') {
      const url = rest[0], delay = Math.max(0, parseInt(rest[1]) || 5);
      if (!/^https?:\/\//.test(url || '')) return say('Usage : /ad page https://... délai');
      const aid = 'ad' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await redis.hset('ads', { [aid]: { id: aid, type: 'page', url, delay, ts: Date.now() } });
      return say(`✅ Pub page ajoutée (id ${aid}) — Skip après ${delay}s. Les autres pubs restent actives (voir /ad list).`);
    }
    if (mode === 'media') {
      const rp = m.reply_to_message;
      if (!rp) return say("Réponds à un message avec une photo et/ou une vidéo : /ad media délai lien texte");
      const delay = Math.max(0, parseInt(rest[0]) || 5), lnk = rest[1] || '', adText = rest.slice(2).join(' ');
      const put = async (file, mime, name) => { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5); await redis.hset('media', { [k]: { k, file, mime, name, owner: 'admin' } }); return k; };
      const video = rp.video ? await put(rp.video.file_id, 'video/mp4', 'ad.mp4') : null;
      const photo = rp.photo ? await put(rp.photo.at(-1).file_id, 'image/jpeg', 'ad.jpg') : null;
      if (!video && !photo) return say('Le message ne contient ni photo ni vidéo');
      const aid = 'ad' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await redis.hset('ads', { [aid]: { id: aid, type: 'media', video, photo, link: lnk, text: adText, delay, ts: Date.now() } });
      return say(`✅ Pub média ajoutée (id ${aid}) — Skip après ${delay}s. Les autres pubs restent actives (voir /ad list).`);
    }
    return say('Usage : /ad off · /ad list · /ad del id · /ad page url délai · /ad media délai lien texte (en réponse à une photo/vidéo)');
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
  if (cmd === '/del' && arg) {
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

  /* ===== tutos vidéo ===== */
  const vid = m.video || (m.document && /^video\//.test(m.document.mime_type || '') ? m.document : null);
  if (cmd === '/tutos') {
    const a = Object.values(await redis.hgetall('tutos') || {});
    return say(a.map(t => `${t.id} — ${t.title}`).join('\n') || 'Aucun tuto');
  }
  if (cmd === '/tutodel' && arg) {
    const n = await redis.hdel('tutos', arg);
    await redis.del('tl:' + arg, 'tcm:' + arg, 'tv:' + arg); await redis.hdel('tviews', arg);
    return say(n ? '🗑 Tuto supprimé' : '❌ ID introuvable (voir /tutos)');
  }
  if (cmd === '/tutoannuler') { await redis.del('tdraft:' + id); return say('✅ Tuto en préparation annulé'); }
  if (vid) {
    if ((vid.file_size || 0) > 20 * 1024 * 1024) return say('⚠️ Vidéo de plus de 20 Mo : le site ne pourra pas la lire (limite Telegram). Compresse-la puis renvoie-la.');
    const [title, ...desc] = (m.caption || '').split('\n');
    const th = vid.thumbnail || vid.thumb;
    await redis.set('tdraft:' + id, { video: vid.file_id, size: vid.file_size || 0, cover: th?.file_id || null, title: title || 'Sans titre', desc: desc.join('\n') }, { ex: 3600 });
    return say('🎬 Vidéo reçue.\n🖼 Envoie une photo (sans légende) pour choisir la couverture, sinon la vignette de la vidéo sera utilisée.\n✅ /tuto pour publier · /tutoannuler pour annuler.');
  }
  if (m.photo && !m.caption) {   // couverture au choix
    const td = await redis.get('tdraft:' + id);
    if (td) { td.cover = m.photo.at(-1).file_id; await redis.set('tdraft:' + id, td, { ex: 3600 }); return say('🖼 Couverture choisie. /tuto pour publier.'); }
  }
  if (cmd === '/tuto') {
    const d = await redis.get('tdraft:' + id);
    if (!d) return say("Envoie d'abord la vidéo (légende : titre puis description).");
    const o = text.slice(5).trim();
    if (o) { const [t, ...ds] = o.split('\n'); d.title = t || d.title; d.desc = ds.join('\n') || d.desc; }
    const tid = Date.now().toString(36);
    await redis.hset('tutos', { [tid]: { id: tid, ...d, ts: Date.now(), by: 'admin' } });
    await redis.del('tdraft:' + id);
    // notification : site (avec son) + Telegram (avec son par défaut)
    const label = `🎬 Nouveau tuto : ${d.title}`;
    await redis.hset('notifs', { [tid + 'n']: { id: tid + 'n', text: label, ts: Date.now() } });
    const site = siteUrl() || 'https://hes-shop.vercel.app';
    const kb = { inline_keyboard: [[{ text: '▶️ Regarder', url: `${site}/?tuto=${tid}` }]] };
    const users = await redis.smembers('bu');
    for (let i = 0; i < users.length; i += 25) {
      await Promise.all(users.slice(i, i + 25).map(u =>
        (d.cover ? tg('sendPhoto', { chat_id: u, photo: d.cover, caption: label, reply_markup: kb }) : Promise.resolve({ ok: false }))
          .then(r => r.ok ? r : tg('sendMessage', { chat_id: u, text: label, reply_markup: kb })).catch(() => {})));
      await new Promise(r => setTimeout(r, 1000));
    }
    return say(`✅ Tuto publié (ID ${tid}) — notification envoyée au site + ${users.length} utilisateurs Telegram`);
  }

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
    return say(`✅ Publié sur le site : ${it.title}\nID : ${it.id}`);
  }
  return sendHelp(chat);
}

const isGroup = m => ['group', 'supergroup'].includes(m?.chat?.type);

export default async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const m = req.body?.message, cq = req.body?.callback_query;
  if (cq) await callback(cq).catch(console.error);
  else if (m?.new_chat_members || m?.left_chat_member) await group(m).catch(console.error);
  else if (isGroup(m) && m.text && /^\/(tagall|all)(@\w+)?(\s|$)/i.test(m.text.trim())) {
    await trackMember(m.chat.id, m.from).catch(() => {});
    await tagAll(m).catch(console.error);
  }
  else if (m?.text && /^\/lien(@\w+)?(\s|$)/i.test(m.text.trim())) await lien(m.chat.id).catch(console.error);
  else if (m?.chat?.type === 'private') await handle(m).catch(e => {
    console.error(e);
    if (String(m.from.id) === String(process.env.OWNER_ID)) return tg('sendMessage', { chat_id: m.chat.id, text: '⚠️ Erreur : ' + e.message });
  });
  else if (isGroup(m)) await trackMember(m.chat.id, m.from).catch(() => {});   // fait grandir la liste pour /tagall à chaque message
  res.status(200).end();
};
