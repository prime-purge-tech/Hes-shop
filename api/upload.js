import { redis, tg, admins } from '../lib/db.js';

// Envoi de gros fichiers vers Vercel Blob, directement depuis le navigateur de l'admin.
// Le lien /upload.html?k=<jeton> est généré par le bot (commande /upload ou après l'envoi d'un gros fichier).
const okHost = u => { try { const h = new URL(u); return h.protocol === 'https:' && /\.(public|private)\.blob\.vercel-storage\.com$/.test(h.hostname); } catch { return false; } };

export default async (req, res) => {
  try {
    const { handleUploadPresigned } = await import('@vercel/blob/client');
    const { del, issueSignedToken } = await import('@vercel/blob');
    // infos sur le lien d'envoi (titre de la publication)
    if (req.method === 'GET') {
      const t = await redis.get('upt:' + String(req.query.k || ''));
      const it = t && await redis.hget('items', String(t.item));
      if (!it) return res.status(404).json({ error: 'Link expired' });
      return res.json({ id: it.id, title: it.title });
    }
    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};

    // fin de l'envoi : rattache le fichier à la publication
    if (body.done) {
      const t = await redis.get('upt:' + String(body.token || ''));
      if (!t || !okHost(body.url)) return res.status(403).json({ error: 'Link expired' });
      const it = await redis.hget('items', String(t.item));
      if (!it) return res.status(404).json({ error: 'Item not found' });
      if (it.blob && it.blob !== body.url) await del(it.blob).catch(() => {});
      it.blob = body.url;
      it.size = Number(body.size) || it.size;
      it.name = String(body.name || it.name || 'file');
      await redis.hset('items', { [it.id]: it });
      await Promise.all((await admins()).map(a => tg('sendMessage', { chat_id: a, text: `✅ Fichier envoyé sur le site : ${it.title}\nLe téléchargement se fait maintenant directement depuis le site.` }).catch(() => {})));
      return res.json({ ok: true });
    }

    // URL d'envoi présignée (fonctionne avec OIDC : BLOB_STORE_ID + BLOB_WEBHOOK_PUBLIC_KEY, sans BLOB_READ_WRITE_TOKEN)
    const json = await handleUploadPresigned({
      body, request: req,
      getSignedToken: async (pathname, clientPayload) => {
        let tok = ''; try { tok = JSON.parse(clientPayload || '{}').token; } catch {}
        const t = tok && await redis.get('upt:' + tok);
        if (!t) throw new Error('Link expired');
        const token = await issueSignedToken({ pathname, operations: ['put'], maximumSizeInBytes: 1e9, validUntil: Date.now() + 3600e3 });
        return { token, urlOptions: { addRandomSuffix: true, allowOverwrite: false, maximumSizeInBytes: 1e9, validUntil: Date.now() + 3600e3 } };
      },
    });
    return res.json(json);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
};
