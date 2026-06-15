import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId   = process.env['FIREBASE_PROJECT_ID']!;
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL']!;
  // Vercel escapa as quebras de linha — restaura \n literal para newline real
  const privateKey  = process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export const messaging = admin.messaging();
