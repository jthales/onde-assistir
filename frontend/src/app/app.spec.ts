import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
import { Jogo } from './models/jogo';

function dataBrt(offsetDias = 0): string {
  const base = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(base);
}

function jogo(over: Partial<Jogo>): Jogo {
  return {
    rodada: 1, timeMandante: 'Flamengo', timeVisitante: 'Palmeiras',
    logoMandante: '', logoVisitante: '', data: dataBrt(5), hora: '20:00',
    canal: ['SporTV'], streaming: ['Premiere'], estadio: 'Maracanã', campeonato: 'Brasileirão',
    ...over,
  } as Jogo;
}

describe('App', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<App>;
  let app: App;

  const JOGOS: Jogo[] = [
    jogo({ timeMandante: 'Flamengo', timeVisitante: 'Palmeiras', data: dataBrt(5), hora: '20:00', canal: ['SporTV'], streaming: ['Premiere'] }),
    jogo({ timeMandante: 'São Paulo', timeVisitante: 'Corinthians', data: dataBrt(6), hora: '16:00', canal: ['TV Globo'], streaming: ['Globoplay'] }),
    jogo({ timeMandante: 'Fluminense', timeVisitante: 'Estudiantes', data: dataBrt(5), hora: '21:30', canal: ['ESPN'], streaming: ['Disney+'], campeonato: 'Libertadores' }),
  ];

  /** Responde as requisições pendentes: /api/jogos com os dados e o restante com lista vazia. */
  function responder(jogos: Jogo[] = JOGOS): void {
    for (const req of http.match(() => true)) {
      if (req.cancelled) continue;
      req.flush(req.request.url.endsWith('/api/jogos') ? jogos : []);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('cria o app mesmo em navegador sem suporte a FCM', () => {
    expect(app).toBeTruthy();
  });

  it('mostra estado de loading com role=status antes dos dados', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Carregando jogos');
  });

  it('renderiza um card por jogo com aria-label', () => {
    responder();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.jogo-card');
    expect(cards.length).toBe(3);
    expect(cards[0].getAttribute('role')).toBe('article');
    expect(cards[0].getAttribute('aria-label')).toContain(' x ');
  });

  it('ordena por data e horário', () => {
    responder();
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['Flamengo', 'Fluminense', 'São Paulo']);
  });

  it('mostra erro com alerta e recarrega ao tentar novamente', () => {
    for (const req of http.match(() => true)) {
      if (!req.cancelled) req.flush('erro', { status: 500, statusText: 'Server Error' });
    }
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')).toBeTruthy();

    app.tentarNovamente();
    expect(app.loading()).toBe(true);
    responder();
    expect(app.error()).toBeNull();
    expect(el.querySelectorAll('.jogo-card').length).toBe(3);
  });

  it('busca ignora acentos e caixa e também casa campeonato', () => {
    responder();
    app.busca.set('SAO paulo');
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['São Paulo']);
    app.busca.set('libertadores');
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['Fluminense']);
    app.busca.set('zzzz');
    expect(app.jogosFiltrados()).toEqual([]);
  });

  it('filtra por data e por canal/plataforma e limpa filtros', () => {
    responder();
    app.filtroData.set(dataBrt(6));
    expect(app.jogosFiltrados().length).toBe(1);
    app.limparFiltrosDescoberta();
    app.filtroPlataforma.set('Disney+');
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['Fluminense']);
    app.filtroPlataforma.set('SporTV');
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['Flamengo']);
    app.limparFiltrosDescoberta();
    expect(app.jogosFiltrados().length).toBe(3);
    expect(app.temFiltroDescoberta()).toBe(false);
  });

  it('lista datas e plataformas disponíveis sem duplicar', () => {
    responder();
    expect(app.datasDisponiveis()).toEqual([dataBrt(5), dataBrt(6)]);
    expect(app.plataformasDisponiveis()).toEqual(
      ['Disney+', 'ESPN', 'Globoplay', 'Premiere', 'SporTV', 'TV Globo'].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );
  });

  it('formatarData usa Hoje/Amanhã em America/Sao_Paulo', () => {
    expect(app.formatarData(dataBrt(0))).toBe('Hoje');
    expect(app.formatarData(dataBrt(1))).toBe('Amanhã');
    expect(app.formatarData(dataBrt(5))).toMatch(/^(Domingo|Segunda|Terça|Quarta|Quinta|Sexta|Sábado), \d{2}\/\d{2}$/);
    expect(app.eHoje(dataBrt(0))).toBe(true);
    expect(app.eHoje(dataBrt(1))).toBe(false);
  });

  it('combina busca, data e plataforma e mostra estado vazio no DOM', () => {
    responder();
    app.busca.set('flamengo');
    app.filtroData.set(dataBrt(5));
    app.filtroPlataforma.set('SporTV');
    expect(app.jogosFiltrados().map(j => j.timeMandante)).toEqual(['Flamengo']);
    app.filtroPlataforma.set('ESPN');
    fixture.detectChanges();
    expect(app.jogosFiltrados()).toEqual([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.jogo-card').length).toBe(0);
    expect(el.querySelector('.state-text')?.textContent).toContain('Nenhum jogo');
  });

  it('busca e filtros via DOM atualizam a lista e o aria-pressed do chip', () => {
    responder();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('.descoberta-busca') as HTMLInputElement;
    input.value = 'corinthians';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelectorAll('.jogo-card').length).toBe(1);
    (el.querySelector('.descoberta-limpar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.jogo-card').length).toBe(3);
    const todos = el.querySelector('.time-chip--todos') as HTMLButtonElement;
    expect(todos.getAttribute('aria-pressed')).toBe('true');
  });

  it('eHoje respeita America/Sao_Paulo na virada de dia UTC (23:30 BRT)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-16T02:30:00Z')); // 23:30 de 15/10 em BRT
      expect(app.eHoje('2026-10-15')).toBe(true);
      expect(app.eHoje('2026-10-16')).toBe(false);
      expect(app.formatarData('2026-10-16')).toBe('Amanhã');
    } finally {
      vi.useRealTimers();
    }
  });

  it('WhatsApp usa "a confirmar" quando não há canal nem streaming', () => {
    const texto = decodeURIComponent(app.buildWhatsappUrl(jogo({ canal: [], streaming: [] })).split('?text=')[1]);
    expect(texto).toContain('Onde assistir: a confirmar');
  });

  it('gera link do WhatsApp com jogo, canais e link do site', () => {
    const url = app.buildWhatsappUrl(JOGOS[0]);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const texto = decodeURIComponent(url.split('?text=')[1]);
    expect(texto).toContain('Flamengo x Palmeiras');
    expect(texto).toContain('SporTV, Premiere');
    expect(texto).toContain('https://');
  });
});
