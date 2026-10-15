import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
import { ClassificacaoEntry, Jogo } from './models/jogo';

describe('Favoritos no App', () => {
  let fixture: ComponentFixture<App> | undefined;
  let http: HttpTestingController;
  let urlAnterior: string;
  let tituloAnterior: string;
  const jogo = (dados: Partial<Jogo>): Jogo => ({
    rodada: 1, timeMandante: 'Flamengo', timeVisitante: 'Palmeiras', data: '2026-10-16', hora: '20:00',
    canal: ['SporTV'], streaming: [], estadio: '', campeonato: 'Brasileirão', ...dados,
  });
  const jogos: Jogo[] = [
    jogo({}),
    jogo({ timeMandante: 'São Paulo', timeVisitante: 'Corinthians', hora: '16:00', campeonato: 'Libertadores' }),
    jogo({ timeMandante: 'Corinthians', timeVisitante: 'Flamengo', data: '2026-10-17', campeonato: 'Copa do Brasil' }),
    jogo({ timeMandante: 'Vasco', timeVisitante: 'Botafogo', hora: '18:00', campeonato: 'Brasileirão Série A' }),
    jogo({ data: '2026-10-14' }),
    jogo({ data: '2026-10-15', hora: '10:00' }),
  ];
  const nomes = ['Flamengo', 'Palmeiras', 'São Paulo', 'Corinthians'];
  const classificacao: ClassificacaoEntry[] = nomes.map((nome, idx) => ({
    nome, posicao: idx + 1, logo: null, jogos: 1, vitorias: 0, empates: 0, derrotas: 0,
    gols: 0, golsSofridos: 0, saldo: 0, pontos: 0,
  }));

  function abrir(path = '/'): ComponentFixture<App> {
    history.replaceState(null, '', path);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  function responder(): void {
    for (let rodada = 0; rodada < 4; rodada++) {
      for (const req of http.match(() => true)) {
        if (req.cancelled) continue;
        req.flush(req.request.url.endsWith('/api/jogos') ? jogos
          : req.request.url.endsWith('/api/classificacao') ? classificacao
          : req.request.url.includes('/classificacao/') ? { tipo: 'grupos', grupos: [] } : []);
      }
      fixture!.detectChanges();
    }
  }

  beforeEach(async () => {
    urlAnterior = location.pathname + location.search + location.hash;
    tituloAnterior = document.title;
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        provideServiceWorker('ngsw-worker.js', { enabled: false })],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    history.replaceState(null, '', urlAnterior);
    document.title = tituloAnterior;
    document.querySelector('script[data-seo="sports-events"]')?.remove();
  });

  it('oferece acesso na home mesmo sem favoritos, com contador zero', () => {
    const view = abrir();
    responder();
    const botao = view.nativeElement.querySelector('.favoritos-acesso') as HTMLButtonElement;
    expect(botao.textContent).toContain('Meus favoritos (0)');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(getComputedStyle(botao).minHeight).toBe('44px');
    botao.click();
    view.detectChanges();
    expect(location.pathname).toBe('/favoritos');
  });

  it('favorita o time selecionado com estrela, aria-pressed, rótulo e indicador no chip', () => {
    const view = abrir('/flamengo');
    responder();
    const botao = view.nativeElement.querySelector('app-favorito-button button') as HTMLButtonElement;
    expect(botao.getAttribute('aria-label')).toBe('Favoritar Flamengo');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(getComputedStyle(botao).minHeight).toBe('44px');
    botao.click();
    view.detectChanges();
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(botao.getAttribute('aria-label')).toBe('Remover Flamengo dos favoritos');
    expect(view.nativeElement.querySelector('[title="Flamengo"] .chip-favorito')?.textContent).toBe('★');
    expect(localStorage.getItem('favoritos-times')).toBe('["Flamengo"]');
    botao.click();
    view.detectChanges();
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(view.nativeElement.querySelector('.chip-favorito')).toBeNull();
  });

  it('favorita o campeonato pelo slug existente e atualiza aria-pressed', () => {
    const view = abrir('/campeonato/libertadores');
    responder();
    const botao = view.nativeElement.querySelector('app-favorito-button button') as HTMLButtonElement;
    expect(botao.getAttribute('aria-label')).toBe('Favoritar Copa Libertadores');
    botao.click();
    view.detectChanges();
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('favoritos-campeonatos')).toBe('["libertadores"]');
  });

  it('filtra futuros por time OU campeonato, sem duplicar e na ordem da home', () => {
    localStorage.setItem('favoritos-times', '["Flamengo"]');
    localStorage.setItem('favoritos-campeonatos', '["brasileirao","libertadores"]');
    const view = abrir('/favoritos');
    responder();
    expect(view.componentInstance.jogosFiltrados()).toEqual([jogos[1], jogos[3], jogos[0], jogos[2]]);
    expect(view.nativeElement.querySelectorAll('.jogo-card').length).toBe(4);
    expect(view.nativeElement.querySelector('h1')?.textContent).toBe('Meus favoritos');
    expect(view.nativeElement.querySelector('.favoritos-acesso')?.textContent).toContain('(3)');
  });

  it('mostra instruções e estado vazio amigável sem favoritos', () => {
    const view = abrir('/favoritos');
    responder();
    expect(view.nativeElement.querySelector('.state-text')?.textContent).toContain('Você ainda não tem favoritos');
    expect(view.nativeElement.querySelector('.state-wrapper')?.textContent).toContain('use a estrela');
    expect(view.nativeElement.querySelectorAll('.jogo-card').length).toBe(0);
    expect(view.nativeElement.querySelector('.time-chip--todos')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('distingue favoritos sem jogos futuros do estado sem favoritos', () => {
    localStorage.setItem('favoritos-times', '["Time sem jogos"]');
    const view = abrir('/favoritos');
    responder();
    expect(view.nativeElement.querySelector('.state-text')?.textContent).toContain('Nenhum jogo futuro dos seus favoritos');
  });

  it('ordena chips favoritos primeiro preservando a ordem de cada grupo', () => {
    localStorage.setItem('favoritos-times', '["São Paulo","Palmeiras"]');
    const view = abrir();
    responder();
    const chips = Array.from((view.nativeElement as HTMLElement).querySelectorAll('.times-grid .time-chip'));
    expect(chips.map(chip => chip.getAttribute('title'))).toEqual(['Palmeiras', 'São Paulo', 'Flamengo', 'Corinthians']);
  });

  it('mantém a ordem original e nenhum indicador quando não há favoritos', () => {
    const view = abrir();
    responder();
    const chips = Array.from((view.nativeElement as HTMLElement).querySelectorAll('.times-grid .time-chip'));
    expect(chips.map(chip => chip.getAttribute('title'))).toEqual(nomes);
    expect(view.nativeElement.querySelector('.chip-favorito')).toBeNull();
  });

  it('define title/og:url/canonical de favoritos e restaura a home ao voltar', () => {
    const view = abrir('/favoritos');
    expect(document.title).toBe('Meus favoritos — Onde Assistir');
    responder();
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/favoritos');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/favoritos');
    (view.nativeElement.querySelector('.favoritos-voltar') as HTMLButtonElement).click();
    view.detectChanges();
    expect(location.pathname).toBe('/');
    expect(view.componentInstance.filtroFavoritos()).toBe(false);
    expect(document.title).toBe('Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/');
  });

  it('permite alternar favoritos pela home e sair para time ou ao vivo sem manter o filtro', () => {
    const view = abrir();
    responder();
    view.componentInstance.favoritos.toggleTime('Flamengo');
    view.componentInstance.busca.set('termo antigo');
    (view.nativeElement.querySelector('.favoritos-acesso') as HTMLButtonElement).click();
    view.detectChanges();
    expect(location.pathname).toBe('/favoritos');
    expect(view.componentInstance.busca()).toBe('');
    expect(view.componentInstance.jogosFiltrados()).toEqual([jogos[0], jogos[2]]);
    view.componentInstance.selecionarTime('Palmeiras');
    responder();
    expect(view.componentInstance.filtroFavoritos()).toBe(false);
    expect(location.pathname).toBe('/palmeiras');
    view.componentInstance.toggleFiltroFavoritos();
    view.componentInstance.toggleFiltroAoVivo();
    expect(view.componentInstance.filtroFavoritos()).toBe(false);
    expect(location.pathname).toBe('/ao-vivo');
  });

  it('mantém o app e os favoritos em memória com localStorage indisponível', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    const view = abrir('/flamengo');
    responder();
    expect(view.componentInstance).toBeTruthy();
    const botao = view.nativeElement.querySelector('app-favorito-button button') as HTMLButtonElement;
    botao.click();
    view.detectChanges();
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(view.componentInstance.favoritos.times()).toEqual(['Flamengo']);
  });
});
