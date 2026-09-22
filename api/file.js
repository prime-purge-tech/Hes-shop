import { Readable } from 'node:stream';
import { redis, tg, brandName, cdisp, whoami } from '../lib/db.js';
export const config = { maxDuration: 60 };

export default async (req, res) => {
  const { id, k, n } = req.query;
  const it = await redis.hget('items', String(id));
  if (!it) return res.status(404).end();
  // img = photo principale, img&n=0.. = captures d'écran, sinon le fichier
  const fid = k === 'img' ? (n != null ? (it.shots || [])[Number(n)] : it.photo) : it.file;
  if (!fid) return res.status(404).end();
  const g = await tg('getFile', { file_id: fid });
  if (!g.ok) return res.status(404).end();
  if (k === 'dl' || k === 'chk') {
    const need = await redis.hget('restrict', String(id));
    if (need) {
      const me = await whoami(req), mine = me && await redis.hget('badges', me);
      if (mine !== need) return res.status(403).json({ error: 'This file needs the ' + need + ' badge' });
    }
  }
  if (k === 'chk') return res.json({ ok: true });   // simple vérification, sans envoyer le fichier
  if (k === 'dl') await redis.hincrby('dls', String(id), 1);
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
  if (k === 'img') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  } else {
    res.setHeader('Content-Type', /\.apk$/i.test(it.name || '') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    res.setHeader('Content-Disposition', cdisp(brandName(it.title, it.name)));
  }
  Readable.fromWeb(r.body).pipe(res);
};
