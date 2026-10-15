import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PushNotificacaoService } from './push-notificacao.service';
import { environment } from '../../environments/environment';

describe('PushNotificacaoService', () => {
  let service: PushNotificacaoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PushNotificacaoService);
    http = TestBed.inject(HttpTestingController);
  });

  it('é criado e getToken retorna null em navegador sem suporte (jsdom)', async () => {
    expect(service).toBeTruthy();
    await expect(service.getToken()).resolves.toBeNull();
  });

  it('onMessage não lança sem suporte a FCM', () => {
    expect(() => service.onMessage(() => undefined)).not.toThrow();
  });

  it('salva a subscrição via POST em /api/subscricao', () => {
    service.salvarSubscricao('tok', ['Flamengo'], ['a_x_b']);
    const req = http.expectOne(`${environment.apiUrl}/api/subscricao`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ fcmToken: 'tok', times: ['Flamengo'], jogos: ['a_x_b'] });
    req.flush({});
  });

  it('remove a subscrição via DELETE com o token codificado', () => {
    service.removerSubscricao('a/b c');
    const req = http.expectOne(`${environment.apiUrl}/api/subscricao/${encodeURIComponent('a/b c')}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
