import { Redis } from '@upstash/redis';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const kdf = promisify(scrypt);

// Base de données (Upstash Redis REST). Variables d'environnement à définir :
// UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
export const redis = Redis.fromEnv();

export const BRAND = "H'ES SHOP — t.me/PRIME_PURGE";

// Nom de fichier renvoyé lors d'un téléchargement / renvoi via le bot :
// « H'ES SHOP - Titre.ext » (garde l'extension d'origine du fichier).
export function brandName(title, name) {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  const safeTitle = String(title || 'file').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'file';
  return `H'ES SHOP - ${safeTitle}${ext ? '.' + ext : ''}`;
}

// En-tête Content-Disposition, avec un nom de fichier UTF-8 correctement encodé.
export function cdisp(filename) {
  const ascii = String(filename).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Appel à l'API Bot Telegram.
export async function tg(method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

// Liste des identifiants Telegram admin : le propriétaire + ceux ajoutés via /addadmin.
export async function admins() {
  const extra = (await redis.smembers('admins')) || [];
  const owner = process.env.OWNER_ID ? [String(process.env.OWNER_ID)] : [];
  return [...new Set([...owner, ...extra.map(String)])];
}

export async function isAdmin(id) {
  return (await admins()).includes(String(id));
}

// Adresse IP du visiteur (déploiement derrière un proxy/CDN).
export function ip(req) {
  const h = req.headers['x-forwarded-for'];
  return (Array.isArray(h) ? h[0] : h || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// Limite le nombre d'appels par clé sur une fenêtre glissante simple (compteur + expiration).
// Retourne true si la limite est dépassée (à utiliser comme "if (await limit(...)) return 429").
export async function limit(key, max, windowSeconds) {
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSeconds);
  return n > max;
}

// Identité de l'utilisateur à partir du jeton de session : en-tête "Authorization: Bearer <t>",
// sinon le paramètre de requête ?t= (utilisé pour les téléchargements en navigation directe,
// qui ne peuvent pas envoyer d'en-tête personnalisé).
export async function whoami(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query?.t || req.query?.token || '');
  if (!token) return null;
  return (await redis.get('sess:' + token)) || null;
}

// Vérifie un mot de passe pour un compte existant (utilisé par /api/profile).
// Retourne le nom d'utilisateur normalisé si correct, sinon null.
export async function verifyPassword(username, password) {
  const n = String(username || '').trim().toLowerCase();
  const u = await redis.hget('users', n);
  if (!u) return null;
  const h = await kdf(String(password || ''), u.salt, 32);
  const good = Buffer.from(u.h, 'hex');
  return h.length === good.length && timingSafeEqual(h, good) ? n : null;
}

// Hiérarchie des badges : gold peut tout télécharger (fichiers gold, blue et libres),
// blue ne peut pas télécharger les fichiers gold. Sans restriction = ouvert à tous.
const RANK = { blue: 1, gold: 2 };
export const canGet = (need, mine) => !need || (RANK[mine] || 0) >= (RANK[need] || 99);
export const needMsg = need => need === 'gold' ? 'This file needs the gold badge' : 'This file needs the blue or gold badge';

// URL publique du site (pour les liens d'envoi de fichiers envoyés par le bot)
export const siteUrl = () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/$/, '');
