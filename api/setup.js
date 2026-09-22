import { tg } from '../lib/db.js';
// Ouvre une fois : https://TON-SITE.vercel.app/api/setup?key=TON_WEBHOOK_SECRET
export default async (req, res) => {
  const s = process.env.WEBHOOK_SECRET;
  if (!s) return res.status(500).json({ erreur: 'Variable WEBHOOK_SECRET manquante sur Vercel (puis redéploie)' });
  if (req.query.key !== s) return res.status(401).json({ erreur: 'Ajoute ?key=TON_WEBHOOK_SECRET à l\'adresse' });
  const url = `https://${req.headers.host}/api/bot`;
  const set = await tg('setWebhook', { url, secret_token: s, allowed_updates: ['message'], drop_pending_updates: true });
  res.json({ url, set, info: (await tg('getWebhookInfo', {})).result });
};
