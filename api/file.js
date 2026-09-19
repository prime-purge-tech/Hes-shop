import { Readable } from 'node:stream';
import { redis, tg } from '../lib/db.js';
export const config = { maxDuration: 60 };

const fail = (res, code, error) => res.status(code).json({ error });
const MIME = { apk: 'application/vnd.android.package-archive', zip: 'application/zip' };

// k=img : image de couverture · k=chk : vérifie que le fichier est disponible (sans le télécharger) · sinon : téléchargement
export default async (req, res) => {
  try {
    const { id, k } = req.query;
    const it = await redis.hget('items', String(id));
    if (!it) return fail(res, 404, 'File not found');
    const fid = k === 'img' ? it.photo : it.file;
    if (!fid) return fail(res, 404, 'Not available');

    const g = await tg('getFile', { file_id: fid });
    if (!g.ok) return fail(res, 404, 'File not available');
    if (k === 'chk') return res.json({ ok: true });

    const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
    if (!r.ok || !r.body) return fail(res, 502, 'Telegram did not return the file');

    if (k === 'img') {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    } else {
      const ext = (it.name || '').split('.').pop().toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(it.name || 'file')}`);
    }
    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Server error');
  }
};
