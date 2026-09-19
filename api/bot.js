import { redis, tg, admins, isAdmin } from '../lib/db.js';

const HELP = "📥 Envoie une photo avec en légende : titre (1re ligne) puis description. Ensuite envoie le fichier / APK.\n(Sans photo : envoie directement le fichier, sa légende = titre.)\n\n/list · /del id · /admins\nPropriétaire : /addadmin id · /rmadmin id";

async function handle(m) {
  const id = m.from.id, chat = m.chat.id;
  const say = t => tg('sendMessage', { chat_id: chat, text: t });
  const [cmd, arg] = (m.text || '').trim().split(/\s+/);

  // Téléchargement des gros fichiers (>20 Mo) via le lien du site : /start f_<id>
  if (cmd === '/start') {
    const it = arg?.startsWith('f_') && await redis.hget('items', arg.slice(2));
    return it ? tg('sendDocument', { chat_id: chat, document: it.file, caption: it.title })
              : say("Bienvenue sur H'es chop 👋");
  }
  if (!await isAdmin(id)) return;
  const owner = String(id) === String(process.env.OWNER_ID);

  if (cmd === '/addadmin' && owner && /^\d+$/.test(arg || ''))
    return redis.sadd('admins', arg).then(() => say(`✅ Admin ajouté : ${arg}\n(il doit avoir fait /start sur le bot pour recevoir les commentaires)`));
  if (cmd === '/rmadmin' && owner) return redis.srem('admins', arg).then(() => say('✅ Admin retiré'));
  if (cmd === '/admins') return say((await admins()).join('\n'));
  if (cmd === '/list') {
    const a = Object.values(await redis.hgetall('items') || {});
    return say(a.map(i => `${i.id} — ${i.title}`).join('\n') || 'Aucun fichier');
  }
  if (cmd === '/del' && arg) return redis.hdel('items', arg).then(() => say('🗑 Supprimé'));

  if (m.photo) {
    const [title, ...desc] = (m.caption || '').split('\n');
    await redis.set('draft:' + id, { photo: m.photo.at(-1).file_id, title: title || 'Sans titre', desc: desc.join('\n') }, { ex: 3600 });
    return say('📎 Photo reçue. Envoie maintenant le fichier / APK.');
  }
  if (m.document) {
    let d = await redis.get('draft:' + id);
    const noPhoto = !d;
    if (!d) {   // pas de photo avant : on publie quand même (légende = titre, sinon nom du fichier)
      const [title, ...desc] = (m.caption || '').split('\n');
      d = { title: title || m.document.file_name || 'Sans titre', desc: desc.join('\n') };
    }
    const it = { id: Date.now().toString(36), ...d, file: m.document.file_id, name: m.document.file_name, size: m.document.file_size, ts: Date.now() };
    await redis.hset('items', { [it.id]: it });
    await redis.del('draft:' + id);
    return say('✅ Publié sur le site : ' + it.title
      + (noPhoto ? '\n(sans image : envoie une photo avant le fichier pour en avoir une)' : '')
      + (it.size > 19e6 ? '\n(gros fichier : le téléchargement passera par le bot)' : ''));
  }
  return say(HELP);
}

export default async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const m = req.body?.message;
  if (m?.chat?.type === 'private') await handle(m).catch(console.error);
  res.status(200).end();
};
