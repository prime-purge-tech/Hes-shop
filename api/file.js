import { Readable } from 'node:stream';
import { redis, tg } from '../lib/db.js';
export const config = { maxDuration: 60 };

export default async (req, res) => {
  const { id, k } = req.query;
  const it = await redis.hget('items', String(id));
  if (!it) return res.status(404).end();
  const g = await tg('getFile', { file_id: k === 'img' ? it.photo : it.file });
  if (!g.ok) return res.status(404).end();
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${g.result.file_path}`);
  if (k === 'img') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(it.name || 'file')}`);
  }
  Readable.fromWeb(r.body).pipe(res);
};
