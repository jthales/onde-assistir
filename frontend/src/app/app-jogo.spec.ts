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
    // As fixtures usam datas fixas (partida em 2026-10-20 20:00): congela só o Date, antes da partida,
    // para os testes não dependerem do relógio real (timers continuam reais).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00-03:00'));
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
    vi.useRealTimers();
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

  it('reutiliza URLs entre ciclos de filtros e invalida o cache quando a lista muda', () => {
    const view = abrir('/');
    responder();
    const nome = vi.fn(() => partida.timeMandante);
    const observado: Jogo = { ...partida, get timeMandante() { return nome(); } };
    const app = view.componentInstance;
    app.jogos.set([observado]);
    expect(app.jogoUrl(observado)).toBe(caminho);
    nome.mockClear();
    app.filtroFavoritos.set(true);
    app.busca.set('São Paulo');
    for (let i = 0; i < 10; i++) expect(app.jogoUrl(observado)).toBe(caminho);
    expect(nome).not.toHaveBeenCalled();
    app.jogos.set([observado, { ...partida, campeonato: 'Libertadores' }]);
    expect(app.jogoUrl(observado)).toBe(caminho + '-brasileirao');
  });

  it('reserva dimensões dos logos e mantém os três primeiros cards sem lazy', () => {
    const view = abrir('/');
    responder([0, 1, 2, 3].map(dia => ({ ...partida, data: `2026-10-${20 + dia}` })));
    const cards = Array.from((view.nativeElement as HTMLElement).querySelectorAll('.jogo-card'));
    expect(cards.length).toBe(4);
    cards.forEach((card, i) => {
      for (const img of card.querySelectorAll('img.logo-img')) {
        expect(img.getAttribute('width')).toBe('44');
        expect(img.getAttribute('height')).toBe('44');
        expect(img.getAttribute('decoding')).toBe('async');
        expect(img.getAttribute('loading')).toBe(i < 3 ? 'eager' : 'lazy');
      }
    });
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

  it('limita a reserva do título e a invisibilidade do rodapé ao carregamento', () => {
    const view = abrir();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('h1')?.classList.contains('partida-titulo--carregando')).toBe(true);
    expect(getComputedStyle(el.querySelector('footer')!).visibility).toBe('hidden');
    responder();
    expect(el.querySelector('h1')?.classList.contains('partida-titulo--carregando')).toBe(false);
    expect(getComputedStyle(el.querySelector('footer')!).visibility).not.toBe('hidden');
  });

  it('remove a reserva do título e revela o rodapé também no 404', () => {
    const view = abrir('/jogo/inexistente');
    responder();
    const el: HTMLElement = view.nativeElement;
    expect(el.querySelector('h1')?.textContent).toBe('Partida não encontrada');
    expect(el.querySelector('h1')?.classList.contains('partida-titulo--carregando')).toBe(false);
    expect(getComputedStyle(el.querySelector('footer')!).visibility).not.toBe('hidden');
  });

  it('encaminha a falha do logo do card para a URL original antes de ocultar', () => {
    const view = abrir();
    const original = 'https://a.espncdn.com/i/teamlogos/soccer/500/819.png';
    responder([{ ...partida, logoMandante: original }]);
    const img = view.nativeElement.querySelector('img.logo-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('/combiner/');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(original);
    expect(img.style.display).toBe('');
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
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

  it('inclui o campeonato no title, og:title e h1 somente quando a URL tem sufixo', () => {
    const view = abrir(caminho + '-libertadores');
    responder([partida, { ...partida, campeonato: 'Libertadores' }]);
    expect(location.pathname).toBe(caminho + '-libertadores');
    expect(view.nativeElement.querySelector('h1')?.textContent).toBe('São Paulo x Atlético-MG (Libertadores)');
    expect(document.title).toBe('São Paulo x Atlético-MG (Libertadores) — Onde Assistir');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
  });

  it.each([false, true])('preserva title/h1 sem sufixo, inclusive no alias legado (colisão: %s)', colisao => {
    const view = abrir();
    responder(colisao ? [partida, { ...partida, campeonato: 'Libertadores' }] : [partida]);
    expect(location.pathname).toBe(caminho);
    expect(view.nativeElement.querySelector('h1')?.textContent).toBe('São Paulo x Atlético-MG');
    expect(document.title).toBe('São Paulo x Atlético-MG — Onde Assistir');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
  });

  it('não publica SportsEvent doméstico no acesso direto à Copa após carregar os jogos da home', () => {
    abrir('/copa-2026');
    responder();
    expect(document.querySelector('script[data-seo="sports-events"]')).toBeNull();
    fixture!.componentInstance.recarregar();
    responder();
    expect(document.querySelector('script[data-seo="sports-events"]')).toBeNull();
  });

  it('limpa SportsEvent ao entrar na Copa e preserva sua geração na home e em ao-vivo', () => {
    const view = abrir('/');
    responder();
    const eventos = () => {
      const script = document.querySelector('script[data-seo="sports-events"]');
      return script ? JSON.parse(script.textContent!)['@graph'] : [];
    };
    expect(eventos()).toHaveLength(jogos.length);
    view.componentInstance.navegarParaCampeonato('Copa do Mundo 2026');
    responder();
    expect(document.querySelector('script[data-seo="sports-events"]')).toBeNull();
    view.componentInstance.voltarParaHome();
    view.detectChanges();
    expect(eventos()).toHaveLength(jogos.length);
    const placar: Placar = {
      timeMandante: partida.timeMandante, timeVisitante: partida.timeVisitante, data: partida.data,
      status: 'em-andamento', placarMandante: 0, placarVisitante: 0, gols: [],
    };
    view.componentInstance.placares.set(new Map([[`${partida.data}_${partida.timeMandante}_${partida.timeVisitante}`, placar]]));
    view.componentInstance.toggleFiltroAoVivo();
    expect(eventos()).toHaveLength(1);
    expect(eventos()[0].name).toBe('São Paulo x Atlético-MG');
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
    expect(document.title).toBe('Onde Assistir — Jogos de Futebol Hoje e da Semana: TV e Streaming');
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
    expect(document.title).toBe('Onde Assistir — Jogos de Futebol Hoje e da Semana: TV e Streaming');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://ondeassistir.space/');
  });

  it.each(['/', '/ao-vivo', '/sao-paulo', '/campeonato/libertadores', '/campeonato/champions-league', '/copa-2026'])(
    'preserva o acesso direto à URL existente %s', url => {
      const view = abrir(url);
      responder();
      expect(view.componentInstance.slugJogo()).toBeNull();
      expect(view.nativeElement.querySelector('.partida-page')).toBeNull();
      expect(location.pathname).toBe(url);
      if (url === '/ao-vivo') expect(view.componentInstance.filtroAoVivo()).toBe(true);
      if (url === '/sao-paulo') expect(view.componentInstance.timeSelecionado()).toBe('São Paulo');
      if (url === '/campeonato/libertadores') expect(view.componentInstance.campeonatoSelecionado()).toBe('libertadores');
      if (url === '/campeonato/champions-league') expect(view.componentInstance.campeonatoSelecionado()).toBe('champions-league');
      if (url === '/copa-2026') expect(view.nativeElement.querySelector('app-copa-2026')).toBeTruthy();
    },
  );

  describe('SEO: robots, canonical, links e JSON-LD', () => {
    const meta = (nome: string, atributo: 'name' | 'property' = 'name') =>
      document.querySelector(`meta[${atributo}="${nome}"]`)?.getAttribute('content');
    const canonicalAtual = () => document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const eventos = () => {
      const script = document.querySelector('script[data-seo="sports-events"]');
      return script ? JSON.parse(script.textContent!)['@graph'] : [];
    };
    const futuro = { ...partida, data: '2099-03-04', hora: '16:00' };

    afterEach(() => document.querySelector('meta[name="robots"]')?.remove());

    it('rota desconhecida sai do índice e aponta o canonical para a home', () => {
      abrir('/pagina-que-nao-existe');
      responder();
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/');
      expect(meta('og:url', 'property')).toBe('https://ondeassistir.space/');
    });

    it('campeonato inexistente é reconhecido antes da API e fica noindex', () => {
      abrir('/campeonato/inexistente');
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/');
      responder();
    });

    it('normaliza caixa e barra final em /campeonato/* e em páginas de time', () => {
      abrir('/campeonato/Libertadores/');
      responder();
      expect(location.pathname).toBe('/campeonato/libertadores');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/campeonato/libertadores');
      expect(meta('robots')).toBe('index, follow');
      abrir('/Sao-Paulo/');
      responder();
      expect(location.pathname).toBe('/sao-paulo');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/sao-paulo');
      expect(meta('robots')).toBe('index, follow');
    });

    it('partida inexistente fica noindex com canonical na home e partida válida volta a index', () => {
      abrir('/jogo/foo-x-bar-2026-01-01');
      responder();
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/');
      abrir();
      responder();
      expect(meta('robots')).toBe('index, follow');
      expect(canonicalAtual()).toBe(canonical);
      expect(meta('og:image', 'property')).toBe(partida.logoMandante);
      expect(meta('twitter:image')).toBe(partida.logoMandante);
    });

    it('description do campeonato usa o próximo jogo real (BRT) e só cita canais confirmados', () => {
      abrir('/campeonato/brasileirao');
      responder([futuro]);
      expect(meta('description')).toContain('Próximo jogo: São Paulo x Atlético-MG, 04/03 às 16:00 (Brasília). Onde assistir: SporTV, Disney+.');
      expect(document.title).toBe('Brasileirão Série A — Tabela e Jogos | Onde Assistir');
      abrir('/campeonato/brasileirao');
      responder([{ ...futuro, canal: [], streaming: [] }]);
      expect(meta('description')).toContain('Transmissão a confirmar.');
      expect(meta('description')).not.toContain('Onde assistir:');
    });

    it('home cobre hoje e a semana sem prometer jogos específicos', () => {
      const view = abrir('/');
      responder();
      view.componentInstance.navegarParaCampeonato('Brasileirão');
      responder();
      view.componentInstance.voltarParaHome();
      expect(meta('description')).toContain('jogos de futebol de hoje e da semana');
      expect(document.title).toContain('Hoje e da Semana');
      expect(meta('robots')).toBe('index, follow');
    });

    it('JSON-LD traz eventStatus, homeTeam/awayTeam e inLanguage; organizer só quando mapeado', () => {
      abrir('/');
      responder([futuro, { ...futuro, timeMandante: 'Time A', timeVisitante: 'Time B', campeonato: 'Liga Desconhecida' },
        { ...futuro, timeMandante: 'Time C', timeVisitante: 'Time D', campeonato: 'Champions League' }]);
      const lista = eventos();
      const por = (nome: string) => lista.find((e: { name: string }) => e.name === nome);
      const mapeado = por('São Paulo x Atlético-MG');
      expect(mapeado.eventStatus).toBe('https://schema.org/EventScheduled');
      expect(mapeado.broadcaster).toBeUndefined();
      expect(mapeado.description).toBe('Transmissão: SporTV, Disney+.');
      expect(por('Time A x Time B').description).toBe('Transmissão: SporTV, Disney+.');
      expect(mapeado.inLanguage).toBe('pt-BR');
      expect(mapeado.homeTeam).toEqual({ '@type': 'SportsTeam', 'name': 'São Paulo' });
      expect(mapeado.awayTeam).toEqual({ '@type': 'SportsTeam', 'name': 'Atlético-MG' });
      expect(mapeado.competitor).toHaveLength(2);
      expect(mapeado.organizer.name).toBe('CBF');
      expect('organizer' in por('Time A x Time B')).toBe(false);
      expect(por('Time C x Time D').organizer.name).toBe('UEFA');
    });

    it('partida encerrada/passada fica noindex com canonical na própria URL; ao vivo continua indexável (BUG-02)', () => {
      const passada = { ...partida, data: '2026-10-19', hora: '20:00' };
      const urlPassada = '/jogo/sao-paulo-x-atletico-mg-2026-10-19';
      abrir(urlPassada);
      responder([passada]);
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space' + urlPassada);
      // 20:30 BRT: a partida das 20:00 está dentro da janela ao vivo.
      vi.setSystemTime(new Date('2026-10-20T20:30:00-03:00'));
      abrir();
      responder([partida]);
      expect(meta('robots')).toBe('index, follow');
      expect(canonicalAtual()).toBe(canonical);
      // 22:30 BRT: passou da janela e não há placar: sai do índice.
      vi.setSystemTime(new Date('2026-10-20T22:30:00-03:00'));
      abrir();
      responder([partida]);
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe(canonical);
    });

    it('eventStatus só em partidas que não passaram; sem valor válido o campo é omitido (BUG-04)', () => {
      abrir('/');
      responder([futuro, { ...futuro, timeVisitante: 'Time Passado', data: '2026-10-19' }]);
      const lista = eventos();
      const por = (nome: string) => lista.find((e: { name: string }) => e.name === nome);
      expect(por('São Paulo x Atlético-MG').eventStatus).toBe('https://schema.org/EventScheduled');
      expect('eventStatus' in por('São Paulo x Time Passado')).toBe(false);
    });

    it('sem canais confirmados o JSON-LD não traz description de transmissão (E2)', () => {
      abrir('/');
      responder([{ ...futuro, canal: [], streaming: [] }]);
      expect('description' in eventos()[0]).toBe(false);
      expect('broadcaster' in eventos()[0]).toBe(false);
    });

    it('/favoritos fica noindex com canonical na própria URL (E1)', () => {
      abrir('/favoritos');
      responder();
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/favoritos');
    });

    it('robots e canonical não ficam presos nas transições internas noindex <-> válida (E4)', () => {
      const view = abrir('/pagina-que-nao-existe');
      responder();
      expect(meta('robots')).toBe('noindex, follow');
      view.componentInstance.voltarParaHome();
      expect(meta('robots')).toBe('index, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/');
      view.componentInstance.toggleFiltroFavoritos();
      expect(meta('robots')).toBe('noindex, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/favoritos');
      view.componentInstance.toggleFiltroFavoritos();
      expect(meta('robots')).toBe('index, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/');
      view.componentInstance.navegarParaCampeonato('Brasileirão');
      responder();
      expect(meta('robots')).toBe('index, follow');
      expect(canonicalAtual()).toBe('https://ondeassistir.space/campeonato/brasileirao');
    });

    it('badge do campeonato é link real com navegação SPA no clique simples', () => {
      const view = abrir('/');
      responder([futuro]);
      const badge = view.nativeElement.querySelector('.campeonato-badge--btn') as HTMLAnchorElement;
      expect(badge.tagName).toBe('A');
      expect(badge.getAttribute('href')).toBe('/campeonato/brasileirao');
      const modificado = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
      badge.dispatchEvent(modificado);
      expect(modificado.defaultPrevented).toBe(false);
      expect(location.pathname).toBe('/');
      const simples = new MouseEvent('click', { bubbles: true, cancelable: true });
      badge.dispatchEvent(simples);
      expect(simples.defaultPrevented).toBe(true);
      expect(location.pathname).toBe('/campeonato/brasileirao');
      responder();
    });

    it('rodapé lista campeonatos e times com página como links rastreáveis', () => {
      const view = abrir('/');
      responder();
      const hrefs = (rotulo: string) => Array.from<HTMLAnchorElement>(
        view.nativeElement.querySelectorAll(`.site-footer-links[aria-label="${rotulo}"] a`)).map(a => a.getAttribute('href'));
      expect(hrefs('Campeonatos')).toEqual([
        '/campeonato/brasileirao', '/campeonato/libertadores', '/campeonato/sul-americana',
        '/campeonato/champions-league', '/campeonato/copa-do-brasil',
      ]);
      expect(hrefs('Times')).toEqual(['/sao-paulo']);
    });
  });
});
