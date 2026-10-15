import * as admin from 'firebase-admin';

// Inicialização lazy: o servidor sobe mesmo sem as credenciais do Firebase;
// apenas as rotas de push falham (com mensagem clara) quando elas estão ausentes.
export function getMessaging(): admin.messaging.Messaging {
  if (!admin.apps.length) {
    const projectId   = process.env['FIREBASE_PROJECT_ID'];
    const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
    const rawKey      = process.env['FIREBASE_PRIVATE_KEY'];

    if (!projectId || !clientEmail || !rawKey) {
      throw new Error('Firebase não configurado: defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.');
    }

    // Vercel escapa as quebras de linha — restaura \n literal para newline real
    const privateKey = rawKey.replace(/\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.messaging();
}
