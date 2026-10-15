import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
import { buildJogoSlug, buildJogoUrl } from './jogo-url';
import { ClassificacaoEntry, Jogo, Placar } from './models/jogo';

describe('Página individual da partida', () => {
  let fixture: ComponentFixture<App> | undefined;
  let http: HttpTestingController;
  let urlAnterior: string;
  let tituloAnterior: string;

  const partida: Jogo = {
    rodada: 1, timeMandante: 'São Paulo', timeVisitante: 'Atlético-MG',
    logoMandante: 'https://example.test/sao-paulo.png', logoVisitante: 'https://example.test/atletico.png',
    data: '2026-10-20', hora: '20:00', canal: ['SporTV'], streaming: ['Disney+'],
    estadio: 'Morumbi', campeonato: 'Brasileirão',
  };
  const jogos = [
    partida,
    { ...partida, data: '2026-10-21' },
    { ...partida, timeMandante: 'Flamengo', timeVisitante: 'Palmeiras' },
  ];
  const classificacao: ClassificacaoEntry[] = [{
    posicao: 1, nome: 'São Paulo', logo: null, jogos: 1, vitorias: 1,
    empates: 0, derrotas: 0, gols: 2, golsSofridos: 0, saldo: 2, pontos: 3,
  }];
  const caminho = '/jogo/sao-paulo-x-atletico-mg-2026-10-20';
  const canonical = 'https://ondeassistir.space' + caminho;

  function abrir(url = caminho): ComponentFixture<App> {
    fixture?.destroy();
    history.replaceState(null, '', url);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  function responder(lista: Jogo[] = jogos): void {
    // Inclui as requisições criadas pelas respostas anteriores e pelos templates.
    for (let rodada = 0; rodada < 4; rodada++) {
      for (const req of http.match(() => true)) {
        if (req.cancelled) continue;
        const url = req.request.url;
        req.flush(url.endsWith('/api/jogos') ? lista
          : url.endsWith('/api/classificacao') ? classificacao
          : url.includes('/classificacao/') || url.includes('/copa-2026/classificacao') ? { tipo: 'grupos', grupos: [] }
          : []);
      }
      fixture!.detectChanges();
    }
  }

  beforeEach(async () => {
    urlAnterior = location.pathname + location.search + location.hash;
    tituloAnterior = document.title;
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    http.verify({ ignoreCancelled: true });
    history.replaceState(null, '', urlAnterior);
    document.title = tituloAnterior;
    document.querySelector('script[data-seo="sports-events"]')?.remove();
  });

  it('gera slug sem acentos com mandante, visitante e data', () => {
    expect(buildJogoSlug(partida)).toBe('sao-paulo-x-atletico-mg-2026-10-20');
    expect(buildJogoUrl(partida)).toBe(caminho);
  });

  it('abre a URL direta com loading e encontra apenas a partida da data solicitada', () => {
    const view = abrir();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Carregando partida');
    responder();
    expect(view.componentInstance.jogoSelecionado()).toEqual(partida);
    expect(el.querySelectorAll('.jogo-card').length).toBe(1);
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toBe('São Paulo x Atlético-MG');
    expect(el.querySelector('main')?.getAttribute('aria-labelledby')).toBe('partida-titulo');
    expect(el.querySelector('.partida-data')?.textContent).toContain('20 de outubro de 2026 · 20:00');
    expect(el.querySelector('.partida-data')?.textContent).toContain('America/Sao_Paulo');
    expect(el.querySelectorAll('.logo-img').length).toBe(2);
    expect(el.querySelector('.badge-tv--link')?.getAttribute('href')).toBe('https://globoplay.globo.com');
    expect(el.querySelector('.badge-streaming--link')?.getAttribute('href')).toBe('https://www.disneyplus.com/pt-br');
    expect(el.querySelector('.partida-voltar')?.getAttribute('href')).toBe('/');
    expect(el.querySelector('.btn-detalhes')).toBeNull();
  });

  it('mostra Partida não encontrada e link para a home sem publicar SportsEvent incorreto', () => {
    const view = abrir('/jogo/inexistente-x-outro-2026-10-20');
    responder();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('h1')?.textContent).toBe('Partida não encontrada');
    expect(el.querySelector('.state-text')?.textContent).toContain('Partida não encontrada');
    expect(el.querySelector('.state-wrapper a')?.getAttribute('href')).toBe('/');
    expect(el.querySelector('.jogo-card')).toBeNull();
    expect(document.querySelector('script[data-seo="sports-events"]')).toBeNull();
  });

  it('mostra erro e recupera a mesma rota ao clicar em Tentar novamente', () => {
    const view = abrir();
    http.expectOne(req => req.url.endsWith('/api/jogos'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    responder();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar');
    const botao = el.querySelector('[role="alert"] button') as HTMLButtonElement;
    expect(botao.textContent).toBe('Tentar novamente');
    botao.click();
    view.detectChanges();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Carregando partida');
    responder();
    expect(location.pathname).toBe(caminho);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('.jogo-card').length).toBe(1);
  });

  it('publica title, description, og:url, canonical e um SportsEvent específico', () => {
    abrir(caminho + '/?origem=teste');
    responder();
    expect(document.title).toBe('São Paulo x Atlético-MG — Onde Assistir');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('SporTV, Disney+');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(canonical);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonical);
    const script = document.querySelector('script[data-seo="sports-events"]')!;
    const eventos = JSON.parse(script.textContent!)['@graph'];
    expect(eventos).toHaveLength(1);
    expect(eventos[0]['@type']).toBe('SportsEvent');
    expect(eventos[0].url).toBe(canonical);
    expect(eventos[0].startDate).toBe('2026-10-20T20:00:00-03:00');
    expect(eventos[0].location.name).toBe('Morumbi');
  });

  it('oferece link de detalhes acessível em cada card da agenda', () => {
    const view = abrir('/');
    responder();
    const links = (view.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.btn-detalhes');
    expect(links.length).toBe(jogos.length);
    expect(links[0].getAttribute('href')).toBe(caminho);
    expect(links[0].getAttribute('aria-label')).toBe('Ver detalhes de São Paulo x Atlético-MG');
  });

  it('mantém data e horário ao atualizar placar e oculta calendário quando o jogo encerra', () => {
    const view = abrir();
    responder();
    const placar: Placar = {
      timeMandante: partida.timeMandante, timeVisitante: partida.timeVisitante, data: partida.data,
      status: 'em-andamento', placarMandante: 2, placarVisitante: 1, gols: [],
    };
    const chave = `${partida.data}_${partida.timeMandante}_${partida.timeVisitante}`;
    view.componentInstance.placares.set(new Map([[chave, placar]]));
    view.detectChanges();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('.ao-vivo-badge')?.textContent).toContain('AO VIVO');
    expect(el.querySelector('.placar-numeros')?.textContent).toContain('2 – 1');
    expect(el.querySelector('.partida-data')?.textContent).toContain('20:00');
    const calendario = el.querySelector('.btn-agendar') as HTMLAnchorElement;
    expect(calendario.href).toContain('calendar.google.com');
    expect(calendario.href).toContain('20261020T230000Z');
    view.componentInstance.placares.set(new Map([[chave, { ...placar, status: 'encerrado' }]]));
    view.detectChanges();
    expect(el.querySelector('.encerrado-badge')?.textContent).toBe('Encerrado');
    expect(el.querySelector('.btn-agendar')).toBeNull();
    const compartilhamento = el.querySelector('.btn-whatsapp') as HTMLAnchorElement;
    expect(decodeURIComponent(compartilhamento.href)).toContain(canonical);
  });

  it('compartilha data absoluta no permalink e preserva Hoje/Amanhã nos cards da home', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
      for (const [data, relativo, absoluto] of [
        ['2026-10-15', 'Hoje', '15 de outubro de 2026'],
        ['2026-10-16', 'Amanhã', '16 de outubro de 2026'],
      ]) {
        const jogo = { ...partida, data, hora: '21:30' };
        const view = abrir(buildJogoUrl(jogo));
        responder([jogo]);
        const permalink = view.nativeElement.querySelector('.btn-whatsapp') as HTMLAnchorElement;
        const texto = new URL(permalink.href).searchParams.get('text')!;
        expect(texto).toContain(absoluto);
        expect(texto).toContain('21:30');
        expect(texto).not.toMatch(/Hoje|Amanhã|Amanha/i);
        expect(texto).toContain('https://ondeassistir.space' + buildJogoUrl(jogo));

        const home = abrir('/');
        responder([jogo]);
        const compartilhamento = home.nativeElement.querySelector('.btn-whatsapp') as HTMLAnchorElement;
        const textoHome = new URL(compartilhamento.href).searchParams.get('text')!;
        expect(textoHome).toBe(`São Paulo x Atlético-MG — ${relativo} às 21:30\nOnde assistir: SporTV, Disney+\nhttps://ondeassistir.space/`);
      }
    } finally {
      fixture?.destroy();
      fixture = undefined;
      vi.useRealTimers();
    }
  });

  it('sai da partida para o campeonato pelo botão existente e volta à home', () => {
    const view = abrir();
    responder();
    (view.nativeElement.querySelector('.campeonato-badge--btn') as HTMLButtonElement).click();
    responder();
    expect(location.pathname).toBe('/campeonato/brasileirao');
    expect(view.componentInstance.slugJogo()).toBeNull();
    expect(view.nativeElement.querySelector('.partida-page')).toBeNull();
    expect(view.nativeElement.querySelector('.campeonato-page')).toBeTruthy();
    view.componentInstance.voltarParaHome();
    view.detectChanges();
    expect(location.pathname).toBe('/');
    expect(view.nativeElement.querySelectorAll('.jogo-card').length).toBe(jogos.length);
  });

  it('preserva meia-noite no calendário da Copa e limpa o SEO da partida ao abrir a Copa', () => {
    const view = abrir();
    responder([{ ...partida, campeonato: 'Copa do Mundo 2026', hora: '00:00' }]);
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('.partida-data')?.textContent).toContain('00:00');
    expect(el.querySelector('.btn-agendar')?.getAttribute('href')).toContain('20261020T030000Z');
    (el.querySelector('.campeonato-badge--btn') as HTMLButtonElement).click();
    responder();
    expect(location.pathname).toBe('/copa-2026');
    expect(el.querySelector('.partida-page')).toBeNull();
    expect(el.querySelector('app-copa-2026')).toBeTruthy();
    expect(document.title).toBe('Copa do Mundo 2026 — Onde Assistir');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/copa-2026');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/copa-2026');
  });

  it('mostra Horário a confirmar quando o jogo não tem horário definido', () => {
    const view = abrir();
    responder([{ ...partida, hora: '' }]);
    expect(view.nativeElement.querySelector('.partida-data')?.textContent).toContain('Horário a confirmar');
    expect(view.nativeElement.querySelector('.hora')).toBeNull();
    expect(view.nativeElement.querySelector('.btn-agendar')).toBeTruthy();
  });

  it('abre o campeonato correto na URL desambiguada e usa o mesmo permalink no SEO e WhatsApp', () => {
    const view = abrir(caminho + '-libertadores');
    const libertadores = { ...partida, campeonato: 'Libertadores' };
    responder([partida, libertadores]);
    expect(view.componentInstance.jogoSelecionado()).toEqual(libertadores);
    expect(view.nativeElement.querySelector('.campeonato-badge')?.textContent.trim()).toBe('Libertadores');
    const url = canonical + '-libertadores';
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(url);
    const graph = JSON.parse(document.querySelector('script[data-seo="sports-events"]')!.textContent!)['@graph'];
    expect(graph[0].url).toBe(url);
    const compartilhamento = view.nativeElement.querySelector('.btn-whatsapp') as HTMLAnchorElement;
    expect(new URL(compartilhamento.href).searchParams.get('text')).toContain(url);
  });

  it('mantém a URL antiga resolvendo para a primeira partida com canonical desambiguado', () => {
    const view = abrir();
    responder([partida, { ...partida, campeonato: 'Libertadores' }]);
    expect(view.componentInstance.jogoSelecionado()?.campeonato).toBe('Brasileirão');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonical + '-brasileirao');
  });

  it('gera links distintos nos cards e preserva o sufixo ao filtrar a lista', () => {
    const view = abrir('/');
    responder([partida, { ...partida, campeonato: 'Libertadores' }]);
    const links = Array.from((view.nativeElement as HTMLElement).querySelectorAll('.btn-detalhes'));
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      caminho + '-brasileirao', caminho + '-libertadores',
    ]);
    view.componentInstance.busca.set('libertadores');
    view.detectChanges();
    expect(view.nativeElement.querySelectorAll('.jogo-card').length).toBe(1);
    expect(view.nativeElement.querySelector('.btn-detalhes')?.getAttribute('href')).toBe(caminho + '-libertadores');
  });

  it.each([
    ['/ao-vivo', 'Ao Vivo — Onde Assistir'],
    ['/copa-2026', 'Copa do Mundo 2026 — Onde Assistir'],
  ])('define SEO no acesso direto a %s e restaura a home', (path, title) => {
    const view = abrir(path);
    expect(document.title).toBe(title);
    responder();
    expect(document.title).toBe(title);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(title);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space' + path);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space' + path);
    view.componentInstance.voltarParaHome();
    view.detectChanges();
    expect(location.pathname).toBe('/');
    expect(document.title).toBe('Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/');
  });

  it('atualiza SEO ao ativar e desativar o filtro ao vivo sem recarregar', () => {
    const view = abrir('/');
    responder();
    view.componentInstance.toggleFiltroAoVivo();
    expect(location.pathname).toBe('/ao-vivo');
    expect(document.title).toBe('Ao Vivo — Onde Assistir');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/ao-vivo');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/ao-vivo');
    view.componentInstance.toggleFiltroAoVivo();
    expect(location.pathname).toBe('/');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/');
  });

  it('atualiza SEO ao abrir a Copa pela navegação interna e restaura ao voltar', () => {
    const view = abrir('/');
    responder();
    view.componentInstance.navegarParaCampeonato('Copa do Mundo 2026');
    responder();
    expect(location.pathname).toBe('/copa-2026');
    expect(document.title).toBe('Copa do Mundo 2026 — Onde Assistir');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/copa-2026');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ondeassistir.space/copa-2026');
    view.componentInstance.voltarParaHome();
    view.detectChanges();
    expect(document.title).toBe('Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/');
  });

  it.each(['/', '/ao-vivo', '/sao-paulo', '/campeonato/libertadores', '/copa-2026'])(
    'preserva o acesso direto à URL existente %s', url => {
      const view = abrir(url);
      responder();
      expect(view.componentInstance.slugJogo()).toBeNull();
      expect(view.nativeElement.querySelector('.partida-page')).toBeNull();
      expect(location.pathname).toBe(url);
      if (url === '/ao-vivo') expect(view.componentInstance.filtroAoVivo()).toBe(true);
      if (url === '/sao-paulo') expect(view.componentInstance.timeSelecionado()).toBe('São Paulo');
      if (url === '/campeonato/libertadores') expect(view.componentInstance.campeonatoSelecionado()).toBe('libertadores');
      if (url === '/copa-2026') expect(view.nativeElement.querySelector('app-copa-2026')).toBeTruthy();
    },
  );
});
