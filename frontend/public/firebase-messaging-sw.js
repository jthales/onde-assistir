importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAOBYr8p-53U4eiixk4HtdNpvqjvmrJx8s',
  authDomain: 'onde-assistir-641a7.firebaseapp.com',
  projectId: 'onde-assistir-641a7',
  storageBucket: 'onde-assistir-641a7.firebasestorage.app',
  messagingSenderId: '388700064939',
  appId: '1:388700064939:web:0ec386c0f385598efefbee',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, tag, data } = payload.notification ?? {};
  self.registration.showNotification(title ?? '⚽ GOL!', {
    body,
    icon: icon ?? '/favicon/icon-512x512.svg',
    tag: tag ?? 'gol',
    data,
  });
});
