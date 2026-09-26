// Service worker : reçoit les notifications push même quand le site est fermé, et gère le clic dessus.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const DEFAULT_ICON = 'https://ganga--link--ghhzdp9sv8hk.code.run/i/npm6axtv.jpg';

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || "H'es Store";
  const opts = {
    body: data.body || '',
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_ICON,
    data: { url: data.url || '/', actionUrls: data.actionUrls || {} },
  };
  if (data.image) opts.image = data.image;
  if (Array.isArray(data.actions) && data.actions.length) opts.actions = data.actions.slice(0, 2);
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const data = e.notification.data || {};
  let url = data.url || '/';
  if (e.action && data.actionUrls && data.actionUrls[e.action]) url = data.actionUrls[e.action];
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
