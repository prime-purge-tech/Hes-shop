import { Readable } from 'node:stream';
import { redis, tg, brandName, cdisp, whoami } from '../lib/db.js';
// Hiérarchie des badges : gold peut tout télécharger, blue pas les fichiers gold
const RANK = { blue: 1, gold: 2 };
const canGet = (need, mine) => !need || (RANK[mine] || 0) >= (RANK[need] || 99);
const needMsg = need => need === 'gold' ? 'This file needs the gold badge' : 'This file needs the blue or gold badge';
export const config = { maxDuration: 60 };

// Deux sources de fichiers :
//  - it.blob : fichier stocké sur Vercel Blob (tout poids) -> redirection directe, téléchargement sur le site
//  - it.file : file_id Telegram -> flux via le site si <= 20 Mo (limite de l'API Bot), sinon via le bot
const BIG = 19e6;
// lien du bot qui renvoie le fichier dans Telegram (gros fichiers > 20 Mo)
const deepOf = id => `https://t.me/${process.env.BOT_USERNAME}?start=f_${encodeURIComponent(String(id))}`;
const dlUrl = u => u + (u.includes('?') ? '&' : '?') + 'download=1';

export default async (req, res) => {
  const { id, k, n } = req.query;
  const it = await redis.hget('items', String(id));
  if (!it) return res.status(404).end();
  // img = photo principale, img&n=0.. = captures d'écran, sinon le fichier
  const fid = k === 'img' ? (n != null ? (it.shots || [])[Number(n)] : it.photo) : (it.file || it.blob);
  if (!fid) return res.status(404).end();

  if (k === 'dl' || k === 'chk') {
    const need = await redis.hget('restrict', String(id));
    if (need) {
      const me = await whoami(req), mine = me && await redis.hget('badges', me);
      if (!me) return res.status(401).json({ error: 'Please log in again to download this file' });
      if (!canGet(need, mine)) return res.status(403).json({ error: needMsg(need) + ' (your badge: ' + (mine || 'none') + ')' });
    }
  }

  // Vérification : dit au site si le fichier se télécharge directement ou passe par le bot (gros fichier Telegram)
  if (k === 'chk') {
    let big = false;
    if (!it.blob) {
      big = Number(it.size) > BIG;
      if (!big) { const g = await tg('getFile', { file_id: it.file }); if (!g.ok) big = true; }
    }
    return res.json({ ok: true, big, deep: deepOf(id) });
  }

  if (k === 'dl' && it.blob) {
    await redis.hincrby('dls', String(id), 1);
    if (!/\.private\.blob\./.test(it.blob)) return res.redirect(302, dlUrl(it.blob));   // store public : téléchargement direct
    // store privé : le site lit le fichier et le renvoie (garde le lien secret)
    const { get } = await import('@vercel/blob');
    const b = await get(it.blob, { access: 'private' });
    if (!b || b.statusCode !== 200) return res.status(404).end();
    res.setHeader('Content-Type', /\.apk$/i.test(it.name || '') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    res.setHeader('Content-Disposition', cdisp(brandName(it.title, it.name)));
    if (b.blob?.size) res.setHeader('Content-Length', String(b.blob.size));
    return Readable.fromWeb(b.stream).pipe(res);
  }

  if (k === 'dl' && Number(it.size) > BIG) return res.redirect(302, deepOf(id));

  const g = await tg('getFile', { file_id: fid });
  if (!g.ok) return k === 'dl' ? res.redirect(302, deepOf(id)) : res.status(404).end();
  if (k === 'dl') await redis.hincrby('dls', String(id), 1);
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
  if (!r.ok || !r.body) return k === 'dl' ? res.redirect(302, deepOf(id)) : res.status(502).end();
  if (k === 'img') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  } else {
    res.setHeader('Content-Type', /\.apk$/i.test(it.name || '') ? 'application/vnd.android.package-archive' : 'application/octet-stream');
    res.setHeader('Content-Disposition', cdisp(brandName(it.title, it.name)));
    const len = r.headers.get('content-length') || it.size;
    if (len) res.setHeader('Content-Length', String(len));   // le navigateur affiche la taille du fichier
  }
  Readable.fromWeb(r.body).pipe(res);
};
