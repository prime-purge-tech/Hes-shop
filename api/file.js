import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { redis, tg, brandName, cdisp, whoami, canGet, needMsg } from '../lib/db.js';
export const config = { maxDuration: 60 };

// Deux sources de fichiers :
//  - it.blob : fichier stocké sur Vercel Blob (tout poids) -> redirection directe, téléchargement sur le site
//  - it.file : file_id Telegram -> flux via le site si <= 20 Mo (limite de l'API Bot), sinon via le bot
const BIG = 19e6;
const dlUrl = u => u + (u.includes('?') ? '&' : '?') + 'download=1';

export default async (req, res) => {
  const { id, k, n } = req.query;
  const it = await redis.hget('items', String(id));
  if (!it) return res.status(404).end();
  // img = photo principale, img&n=0.. = captures d'écran, sinon le fichier
  const fid = k === 'img' ? (n != null ? (it.shots || [])[Number(n)] : it.photo) : (it.file || it.blob);
  if (!fid) return res.status(404).end();
  const deep = `https://t.me/${process.env.BOT_USERNAME}?start=f_${encodeURIComponent(String(id))}`;

  if (k === 'dl' || k === 'chk') {
    const need = await redis.hget('restrict', String(id));
    if (need) {
      const me = await whoami(req), mine = me && await redis.hget('badges', me);
      if (!canGet(need, mine)) return res.status(403).json({ error: needMsg(need) });
    }
  }

  // Vérification : dit au site si le fichier se télécharge directement ou passe par le bot (gros fichier Telegram)
  if (k === 'chk') {
    let big = false;
    if (!it.blob) {
      big = Number(it.size) > BIG;
      if (!big) { const g = await tg('getFile', { file_id: it.file }); if (!g.ok) big = true; }
    }
    return res.json({ ok: true, big, deep });
  }

  if (k === 'dl' && it.blob) {
    await redis.hincrby('dls', String(id), 1);
    if (!/\.private\.blob\./.test(it.blob)) return res.redirect(302, dlUrl(it.blob));   // store public : téléchargement direct
    // store privé : le site lit le fichier et le renvoie (garde le lien secret)
    const b = await get(it.blob, { access: 'private' });
    if (!b || b.statusCode !== 200) return res.status(404).end();
    res.setHeader('Content-Type', /\.apk$/i.test(it.name || '') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    res.setHeader('Content-Disposition', cdisp(brandName(it.title, it.name)));
    if (b.blob?.size) res.setHeader('Content-Length', String(b.blob.size));
    return Readable.fromWeb(b.stream).pipe(res);
  }

  if (k === 'dl' && Number(it.size) > BIG) { await redis.hincrby('dls', String(id), 1); return res.redirect(302, deep); }

  const g = await tg('getFile', { file_id: fid });
  if (!g.ok) return k === 'dl' ? res.redirect(302, deep) : res.status(404).end();
  if (k === 'dl') await redis.hincrby('dls', String(id), 1);
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
  if (!r.ok || !r.body) return k === 'dl' ? res.redirect(302, deep) : res.status(502).end();
  if (k === 'img') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  } else {
    res.setHeader('Content-Type', /\.apk$/i.test(it.name || '') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    res.setHeader('Content-Disposition', cdisp(brandName(it.title, it.name)));
  }
  Readable.fromWeb(r.body).pipe(res);
};
