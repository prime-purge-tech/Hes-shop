import { redis, tg, admins, isAdmin, BRAND, brandName } from '../lib/db.js';
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
