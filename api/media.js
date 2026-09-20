import { Readable } from 'node:stream';
import { redis, tg, whoami, limit, BRAND, cdisp } from '../lib/db.js';
export const config = { maxDuration: 60, api: { bodyParser: false } };
const TYPES = { photo: 'image/', video: 'video/', voice: 'audio/' };
const EXT = { 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

export default async (req, res) => {
  if (req.method === 'GET') {   // lecture / téléchargement d'un média du chat
    const m = await redis.hget('media', String(req.query.k));
    if (!m) return res.status(404).end();
    const g = await tg('getFile', { file_id: m.file });
    if (!g.ok) return res.status(404).end();
    const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.query.dl) res.setHeader('Content-Disposition', cdisp(`${BRAND} - ${m.name}`));
    return Readable.fromWeb(r.body).pipe(res);
  }
  // envoi : le fichier est gardé dans Telegram (MEDIA_CHAT, sinon ton chat avec le bot)
  const me = await whoami(req);
  if (!me) return res.status(401).json({ error: 'Log in again' });
  if (await limit('rl:u:' + me, 15, 600)) return res.status(429).json({ error: 'Too many uploads, wait a moment' });
  const type = String(req.query.t), mime = String(req.headers['content-type'] || '').split(';')[0];
  if (!TYPES[type] || !mime.startsWith(TYPES[type])) return res.status(400).json({ error: 'Unsupported file' });
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 4.3e6) return res.status(413).json({ error: 'File too large (max 4 MB)' }); chunks.push(c); }
  const name = `${type}-${Date.now().toString(36)}.${EXT[mime] || mime.split('/')[1].replace(/\W.*/, '')}`;
  const fd = new FormData();
  fd.append('chat_id', String(process.env.MEDIA_CHAT || process.env.OWNER_ID));
  fd.append('caption', `📎 ${type} · ${me}`);
  fd.append('document', new Blob([Buffer.concat(chunks)], { type: mime }), name);
  const r = await (await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd })).json();
  if (!r.ok) return res.status(502).json({ error: 'Upload failed' });
  const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await redis.hset('media', { [k]: { k, file: r.result.document.file_id, mime, name, owner: me, type, size: n } });
  res.json({ k });
};

