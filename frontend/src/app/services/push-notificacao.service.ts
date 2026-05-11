import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificacaoService {
  private messaging = (() => {
    const app = getApps().length ? getApps()[0] : initializeApp(environment.firebaseConfig);
    return getMessaging(app);
  })();

  constructor(private http: HttpClient) {}

  async getToken(): Promise<string | null> {
    try {
      const sw = await navigator.serviceWorker.ready;
      return await getToken(this.messaging, {
        vapidKey: environment.firebaseConfig.vapidKey,
        serviceWorkerRegistration: sw,
      });
    } catch {
      return null;
    }
  }

  onMessage(handler: (payload: any) => void): void {
    onMessage(this.messaging, handler);
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
