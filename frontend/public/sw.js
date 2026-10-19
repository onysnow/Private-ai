// The Workbench's service worker: it does one thing, show a Web Push notice (Settings ›
// Notifications › Outside the app). The server sends only the kind of alert and how many,
// never a name, a case or text from the records; a click opens the Workbench.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {body: event.data ? event.data.text() : ''}; }
  event.waitUntil(self.registration.showNotification(data.title || 'Journalism Workbench', {
    body: data.body || 'Something is waiting for you in the Workbench.',
    tag: 'workbench',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('/');
  }));
});
