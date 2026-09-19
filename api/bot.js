import { redis, tg, admins, isAdmin } from '../lib/db.js';

const HELP = `📥 Ajouter : envoie une photo avec en légende le titre (ligne 1) puis la description, puis le fichier / APK.

/list — voir les publications
/del ID — supprimer une publication
/chat texte — écrire dans le chat du site
/clearchat — vider le chat
/admins — voir les admins
/addadmin ID · /rmadmin ID (propriétaire)

💬 Réponds à un commentaire reçu pour répondre sur le site, ou réponds « /del » pour le supprimer.`;

const SHOP = 'https://t.me/Hessbbot/hes_shop';
const BTN = { inline_keyboard: [[{ text: "𝙃'𝙀𝙎 𝙎𝙃𝙊𝙋", url: SHOP }]] };
const WELCOME_PIC = 'https://ganga--link--ghhzdp9sv8hk.code.run/i/xy6if8fs.jpg';
// images du /start : une au hasard à chaque fois (.gif / .mp4 = animation)
const PICS = [
  'wvz1thzx', 'o2fj6hix', 'gafdfod1', 'fplrpby1', 'h9i8jy21',
  'bgtfa3t0', 'vqein3sw', 'kfwqxcds', 'jx2md37u', 'b8kmu9y4',
  's3o26slw', '3ja15rn2', 'l1kots7k', 'jnk025hg', 'ugbla3cl',
].map(k => `https://ganga--link--ghhzdp9sv8hk.code.run/i/${k}.jpg`);

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

async function handle(m) {
  const id = m.from.id, chat = m.chat.id;
  const say = t => tg('sendMessage', { chat_id: chat, text: t });
  const text = (m.text || '').trim();
  const [c0, arg] = text.split(/\s+/), cmd = c0?.split('@')[0];

  // gros fichiers (>20 Mo) : lien du site -> /start f_<id>
  if (cmd === '/start') {
    const it = arg?.startsWith('f_') && await redis.hget('items', arg.slice(2));
    if (it) return tg('sendDocument', { chat_id: chat, document: it.file, caption: it.title });
    await send(chat, PICS[Math.floor(Math.random() * PICS.length)],
      `👋 Bienvenue ${nm(m.from)} sur <b>H'es chop</b> !\n\nApps, fichiers et discussions : tout est dans la mini app ci-dessous.`);
    return (await isAdmin(id)) ? say(HELP) : undefined;
  }
  if (!await isAdmin(id)) return;
  const owner = String(id) === String(process.env.OWNER_ID);

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
    await redis.hdel('likes', arg); await redis.del('lk:' + arg);
    return say(n ? '🗑 Publication supprimée' : '❌ ID introuvable (voir /list)');
  }
  if (cmd === '/chat' && text.length > 6) {
    await redis.lpush('chat', { id: Date.now().toString(36), name: 'Admin', text: text.slice(6).trim().slice(0, 500), ts: Date.now(), admin: true });
    await redis.ltrim('chat', 0, 99);
    return say('✅ Envoyé dans le chat');
  }
  if (cmd === '/clearchat') return redis.del('chat').then(() => say('🧹 Chat vidé'));

  if (m.photo) {
    const [title, ...desc] = (m.caption || '').split('\n');
    await redis.set('draft:' + id, { photo: m.photo.at(-1).file_id, title: title || 'Sans titre', desc: desc.join('\n') }, { ex: 3600 });
    return say('📎 Photo reçue. Envoie maintenant le fichier / APK.');
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
