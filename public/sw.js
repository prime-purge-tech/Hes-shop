// Service worker : reçoit les notifications push même quand le site est fermé, et gère le clic dessus.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || "H'es Store";
  const body = data.body || '';
  const url = data.url || '/';
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: 'https://ganga--link--ghhzdp9sv8hk.code.run/i/jtn1l7jk.jpg',
    badge: 'https://ganga--link--ghhzdp9sv8hk.code.run/i/jtn1l7jk.jpg',
    data: { url },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
