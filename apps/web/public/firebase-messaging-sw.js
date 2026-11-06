/* Firebase Cloud Messaging background worker. */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCNtwIPW-BbRpW7GaFzuleP9I1YRpvIUWk',
  authDomain: 'nova-8661a.firebaseapp.com',
  projectId: 'nova-8661a',
  storageBucket: 'nova-8661a.firebasestorage.app',
  messagingSenderId: '148286950397',
  appId: '1:148286950397:web:6f3ed001c1ddb496966794',
  measurementId: 'G-G1E9TDN6ND',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || 'NOVA';
  const options = {
    body: payload.data?.body || 'Yeni mesaj var',
    data: payload.data || {},
    tag: payload.data?.conversation_id || 'nova-message',
    renotify: false,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversation_id;
  const target = conversationId
    ? `/?conversation=${encodeURIComponent(conversationId)}`
    : '/';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await clients.openWindow(target);
  })());
});
