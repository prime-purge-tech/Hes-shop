import webpush from 'web-push';
import { redis, admins, isAdmin } from './db.js';

// Clés VAPID : générées une fois pour ce projet, à mettre dans les variables d'environnement Vercel
// (jamais dans le code). VAPID_SUBJECT = une adresse mailto: ou une URL du site, exigée par le protocole.
// Tant que les 2 clés ne sont pas configurées, le push est simplement désactivé (ne fait jamais planter le bot).
const READY = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (READY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  } catch (e) { console.error('VAPID keys invalid:', e.message); }
}

// Enregistre/remplace l'abonnement push d'un compte (un seul appareil actif à la fois par compte, simple et suffisant ici)
export const savePush = (user, sub) => redis.hset('push', { [user]: sub });
export const removePush = user => redis.hdel('push', user);

// Envoie une notification à tous les comptes abonnés ; retire automatiquement les abonnements expirés/révoqués
export async function pushToAll(payload) {
  if (!READY) return { ok: 0, total: 0 };   // push pas encore configuré : on ne casse rien, on ignore juste
  const all = await redis.hgetall('push') || {};
  const users = Object.keys(all);
  let ok = 0;
  for (let i = 0; i < users.length; i += 25) {
    await Promise.all(users.slice(i, i + 25).map(async u => {
      try {
        await webpush.sendNotification(all[u], JSON.stringify(payload));
        ok++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await redis.hdel('push', u);   // abonnement mort : on l'oublie
      }
    }));
  }
  return { ok, total: users.length };
}

export { isAdmin };
