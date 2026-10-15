import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificacaoService {
  // Inicialização lazy e tolerante: em navegadores sem suporte a FCM (ex.: iOS Safari fora do PWA)
  // getMessaging() lança erro — isso não pode derrubar o app inteiro na criação do serviço.
  private messagingInstance: Messaging | null | undefined;

  private get messaging(): Messaging | null {
    if (this.messagingInstance === undefined) {
      try {
        const app = getApps().length ? getApps()[0] : initializeApp(environment.firebaseConfig);
        this.messagingInstance = getMessaging(app);
      } catch {
        this.messagingInstance = null;
      }
    }
    return this.messagingInstance;
  }

  constructor(private http: HttpClient) {}

  async getToken(): Promise<string | null> {
    const messaging = this.messaging;
    if (!messaging) return null;
    try {
      const sw = await navigator.serviceWorker.ready;
      return await getToken(messaging, {
        vapidKey: environment.firebaseConfig.vapidKey,
        serviceWorkerRegistration: sw,
      });
    } catch {
      return null;
    }
  }

  onMessage(handler: (payload: any) => void): void {
    const messaging = this.messaging;
    if (messaging) onMessage(messaging, handler);
  }

  salvarSubscricao(fcmToken: string, times: string[], jogos: string[]): void {
    this.http.post(`${environment.apiUrl}/api/subscricao`, { fcmToken, times, jogos })
      .subscribe({ error: (e) => console.error('Erro ao salvar subscrição FCM:', e) });
  }

  removerSubscricao(fcmToken: string): void {
    this.http.delete(`${environment.apiUrl}/api/subscricao/${encodeURIComponent(fcmToken)}`)
      .subscribe({ error: (e) => console.error('Erro ao remover subscrição FCM:', e) });
  }
}
