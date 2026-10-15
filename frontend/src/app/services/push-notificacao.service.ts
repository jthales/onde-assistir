import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, Messaging } from 'firebase/messaging';
import { environment } from '../../environments/environment';

const SW_READY_TIMEOUT_MS = 5000;

@Injectable({ providedIn: 'root' })
export class PushNotificacaoService {
  // Inicialização lazy e tolerante: em navegadores sem suporte a FCM (ex.: iOS Safari fora do PWA)
  // getMessaging() lança erro — isso não pode derrubar o app inteiro na criação do serviço.
  // isSupported() é consultado antes para não disparar a rejeição interna do SDK.
  private messagingPromise: Promise<Messaging | null> | null = null;

  private getMessagingSafe(): Promise<Messaging | null> {
    if (!this.messagingPromise) {
      this.messagingPromise = (async () => {
        try {
          if (!(await isSupported())) return null;
          const app = getApps().length ? getApps()[0] : initializeApp(environment.firebaseConfig);
          return getMessaging(app);
        } catch {
          return null;
        }
      })();
    }
    return this.messagingPromise;
  }

  constructor(private http: HttpClient) {}

  async getToken(): Promise<string | null> {
    const messaging = await this.getMessagingSafe();
    if (!messaging) return null;
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
    try {
      // `serviceWorker.ready` nunca resolve se não houver SW registrado (ex.: ng serve);
      // sem timeout o getToken ficaria pendente para sempre.
      const sw = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
      ]);
      if (!sw) return null;
      return await getToken(messaging, {
        vapidKey: environment.firebaseConfig.vapidKey,
        serviceWorkerRegistration: sw,
      });
    } catch {
      return null;
    }
  }

  onMessage(handler: (payload: any) => void): void {
    void this.getMessagingSafe().then((messaging) => {
      if (!messaging) return;
      try {
        onMessage(messaging, handler);
      } catch {
        // listener indisponível neste navegador: ignora silenciosamente
      }
    });
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
