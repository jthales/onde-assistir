import { Component, OnInit, OnDestroy, signal, computed, ElementRef, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { interval, forkJoin } from 'rxjs';
import { JogosService } from './services/jogos.service';
import { Jogo, Placar, Odds, ClassificacaoEntry, Noticia, ClassificacaoResponse, JogoCampeonato } from './models/jogo';
import { teamInitials } from './team-logos';

declare global {
  interface Window { gtag: (...args: any[]) => void; }
}

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function gaPush(event: string, params: Record<string, any> = {}): void {
  if (typeof window.gtag === 'function') {
    window.gtag('event', event, params);
  }
}

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  jogos = signal<Jogo[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  timeSelecionado = signal<string>('');
  filtroAoVivo = signal(false);
  showConsentBanner = signal(localStorage.getItem('ga_consent') === null);
  placares = signal<Map<string, Placar>>(new Map());
  odds = signal<Map<string, Odds>>(new Map());
  classificacao = signal<ClassificacaoEntry[]>([]);
  noticias = signal<Noticia[]>([]);
  atualizacaoDisponivel = signal(false);
  timesComNotificacao = signal<string[]>(
    JSON.parse(localStorage.getItem('notif-times') ?? '[]')
  );
  jogosComNotificacao = signal<string[]>(
    JSON.parse(localStorage.getItem('notif-jogos') ?? '[]')
  );
  golToast = signal<string | null>(null);
  pullDistance = signal(0);
  isPulling = signal(false);
  isRefreshing = signal(false);

  campeonatoSelecionado = signal<string>('');
  classificacaoCampeonato = signal<ClassificacaoResponse | null>(null);
  jogosCampeonato = signal<JogoCampeonato[]>([]);
  noticiasCampeonato = signal<Noticia[]>([]);
  loadingCampeonato = signal(false);

  private pollingInterval?: ReturnType<typeof setInterval>;
  private oddsInterval?: ReturnType<typeof setInterval>;
  private classificacaoInterval?: ReturnType<typeof setInterval>;
  private campeonatoClassifInterval?: ReturnType<typeof setInterval>;
  private golToastTimer?: ReturnType<typeof setTimeout>;
  private prevGoalCounts = new Map<string, number>();

  readonly jogosCampeonatoAgrupados = computed(() => {
    const jogos = this.jogosCampeonato().slice(0, 10);
    const map = new Map<number | string, JogoCampeonato[]>();
    for (const jogo of jogos) {
      const key = jogo.rodada ?? jogo.fase ?? 'sem-rodada';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(jogo);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      rodada: typeof key === 'number' ? key : null,
      label: typeof key === 'number' ? `${key}ª Rodada`
           : key !== 'sem-rodada'   ? String(key)
           : null,
      jogos: list,
    }));
  });

  readonly notifAtivaParaTimeAtual = computed(() => {
    const sel = this.timeSelecionado();
    return sel
      ? this.timesComNotificacao().includes(sel)
      : this.timesComNotificacao().length > 0;
  });

  readonly h1Title = computed(() => {
    const camp = this.campeonatoSelecionado();
    if (camp) return this.getLabelCampeonato(camp);
    const nome = this.timeSelecionado();
    return nome
      ? `${nome} — Próximos Jogos e Onde Assistir`
      : 'Onde Assistir Futebol Ao Vivo — TV e Streaming no Brasil';
  });

  private readonly CAMP_DISPLAY: Record<string, string> = {
    'BRASILEIRAO':           'Brasileirão Série A',
    'BRASILEIRAO SERIE A':   'Brasileirão Série A',
    'BRASILEIRAO SERIE B':   'Brasileirão Série B',
    'COPA DO BRASIL':        'Copa do Brasil',
    'LIBERTADORES':          'Copa Libertadores',
    'COPA LIBERTADORES':     'Copa Libertadores',
    'CONMEBOL LIBERTADORES': 'Copa Libertadores',
    'SUL-AMERICANA':         'Copa Sul-Americana',
    'COPA SUL-AMERICANA':    'Copa Sul-Americana',
  };

  private readonly CAMP_SLUG_MAP: Record<string, string> = {
    'BRASILEIRAO':           'brasileirao',
    'BRASILEIRAO SERIE A':   'brasileirao',
    'LIBERTADORES':          'libertadores',
    'COPA LIBERTADORES':     'libertadores',
    'CONMEBOL LIBERTADORES': 'libertadores',
    'SUL-AMERICANA':         'sul-americana',
    'COPA SUL-AMERICANA':    'sul-americana',
    'CONMEBOL SULAMERICANA': 'sul-americana',
    'COPA DO BRASIL':        'copa-do-brasil',
  };

  private readonly CAMP_SLUG_LABEL: Record<string, string> = {
    'brasileirao':    'Brasileirão Série A',
    'libertadores':   'Copa Libertadores',
    'sul-americana':  'Copa Sul-Americana',
    'copa-do-brasil': 'Copa do Brasil',
  };

  slugifyCampeonato(nome: string): string {
    const key = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return this.CAMP_SLUG_MAP[key] ?? '';
  }

  getLabelCampeonato(slug: string): string {
    return this.CAMP_SLUG_LABEL[slug] ?? slug;
  }

  navegarParaCampeonato(nomeCampeonato: string): void {
    const slug = this.slugifyCampeonato(nomeCampeonato);
    if (!slug) return;
    this.timeSelecionado.set('');
    this.filtroAoVivo.set(false);
    this.noticias.set([]);
    this.campeonatoSelecionado.set(slug);
    history.replaceState(null, '', `/campeonato/${slug}`);
    this.atualizarMetaCampeonato(slug);
    this.carregarDadosCampeonato(slug);
    gaPush('ver_campeonato', { campeonato: slug });
  }

  voltarParaHome(): void {
    this.campeonatoSelecionado.set('');
    this.classificacaoCampeonato.set(null);
    this.jogosCampeonato.set([]);
    this.noticiasCampeonato.set([]);
    clearInterval(this.campeonatoClassifInterval);
    history.replaceState(null, '', '/');
    this.atualizarMeta('');
  }

  private carregarDadosCampeonato(liga: string): void {
    this.loadingCampeonato.set(true);
    this.classificacaoCampeonato.set(null);
    this.jogosCampeonato.set([]);
    this.noticiasCampeonato.set([]);
    clearInterval(this.campeonatoClassifInterval);

    forkJoin({
      classif:  this.jogosService.getClassificacaoCampeonato(liga),
      jogos:    this.jogosService.getJogosCampeonato(liga),
      noticias: this.jogosService.getNoticiasCampeonato(liga),
    }).subscribe({
      next: ({ classif, jogos, noticias }) => {
        this.classificacaoCampeonato.set(classif);
        this.jogosCampeonato.set(jogos);
        this.noticiasCampeonato.set(noticias);
        this.loadingCampeonato.set(false);
        this.campeonatoClassifInterval = setInterval(() => {
          this.jogosService.getClassificacaoCampeonato(liga).subscribe({
            next: (c) => this.classificacaoCampeonato.set(c),
          });
        }, 30_000);
      },
      error: () => this.loadingCampeonato.set(false),
    });
  }

  private atualizarMetaCampeonato(slug: string): void {
    const label = this.getLabelCampeonato(slug);
    const title = `${label} — Tabela e Jogos | Onde Assistir`;
    const desc = `Tabela de classificação, próximos jogos e notícias da ${label}.`;
    const url = `${this.BASE_URL}/campeonato/${slug}`;
    this.titleService.setTitle(title);
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ name: 'description', content: desc });
    this.setCanonical(url);
  }

  eJogoCampeonatoHoje(jogo: JogoCampeonato): boolean {
    return this.eHoje(jogo.data);
  }

  formatarDataCampeonato(jogo: JogoCampeonato): string {
    return this.formatarData(jogo.data);
  }

  readonly descricaoSeo = computed(() => {
    const jogos = this.jogosFiltrados();
    const time = this.timeSelecionado();
    if (jogos.length === 0) return '';

    if (time) {
      const n = jogos.length;
      const plural = n > 1 ? 'jogos' : 'jogo';
      const proximo = jogos.find(j => new Date() < new Date(`${j.data}T${j.hora || '23:59'}:00-03:00`));
      if (!proximo) return `O ${time} tem ${n} ${plural} nesta semana.`;
      const tv = proximo.canal.join(', ');
      const stream = proximo.streaming.join(', ');
      const canais = [tv, stream].filter(Boolean).join(' e ') || 'a confirmar';
      const dataFmt = this.formatarData(proximo.data);
      const horaFmt = proximo.hora && proximo.hora !== '00:00' ? `, às ${proximo.hora}` : '';
      return `O ${time} tem ${n} ${plural} nos próximos dias. O próximo é ${proximo.timeMandante} x ${proximo.timeVisitante} no dia ${dataFmt}${horaFmt}, transmitido por ${canais}.`;
    }

    // Homepage
    const datas = [...new Set(jogos.map(j => j.data))].sort();
    let intervalo: string;
    if (datas.length === 1) {
      const [, m, d] = datas[0].split('-');
      intervalo = `${d}/${m}`;
    } else {
      const [, m1, d1] = datas[0].split('-');
      const [, m2, d2] = datas[datas.length - 1].split('-');
      intervalo = m1 === m2 ? `${d1}–${d2}/${m1}` : `${d1}/${m1}–${d2}/${m2}`;
    }
    const isWeekend = datas.some(d => {
      const day = new Date(`${d}T12:00:00-03:00`).getDay();
      return day === 0 || day === 6;
    });
    const periodo = isWeekend ? 'Neste fim de semana' : 'Nesta semana';
    const contCamp = new Map<string, number>();
    for (const j of jogos) {
      if (j.campeonato) contCamp.set(j.campeonato, (contCamp.get(j.campeonato) ?? 0) + 1);
    }
    const campRaw = [...contCamp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const campKey = campRaw?.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '';
    const campDisplay = this.CAMP_DISPLAY[campKey] ?? campRaw ?? 'futebol brasileiro';
    const destaque = jogos.find(j => j.canal.includes('Globo')) ?? jogos[0];
    const canaisDestaque = [...destaque.canal, ...destaque.streaming].join(', ') || 'a confirmar';
    const estadioDestaque = destaque.estadio ? ` no ${destaque.estadio}` : '';
    return `${periodo} (${intervalo}), ${campDisplay} tem ${jogos.length} jogos, com destaque para ${destaque.timeMandante} x ${destaque.timeVisitante}${estadioDestaque}, transmitido pela ${canaisDestaque}. Veja abaixo todos os horários, canais de TV e plataformas de streaming.`;
  });

  private pullStartY = 0;
  private readonly PULL_THRESHOLD = 72;
  private onTouchStart = (e: TouchEvent) => {
    if (window.scrollY > 0 || this.isRefreshing()) return;
    this.pullStartY = e.touches[0].clientY;
    this.isPulling.set(true);
  };
  private onTouchMove = (e: TouchEvent) => {
    if (!this.isPulling() || this.isRefreshing()) return;
    const delta = e.touches[0].clientY - this.pullStartY;
    if (delta <= 0) { this.pullDistance.set(0); return; }
    // Resistência progressiva
    const dist = Math.min(delta * 0.45, this.PULL_THRESHOLD * 1.4);
    this.pullDistance.set(dist);
    if (delta > 10) e.preventDefault();
  };
  private onTouchEnd = () => {
    if (!this.isPulling()) return;
    this.isPulling.set(false);
    if (this.pullDistance() >= this.PULL_THRESHOLD) {
      this.recarregar();
    } else {
      this.pullDistance.set(0);
    }
  };

  logosMap = computed(() => {
    const m = new Map<string, string>();
    // Jogos (ESPN scoreboard) — cobre times de Libertadores/Sul-Americana também
    for (const j of this.jogos()) {
      if (j.logoMandante)  m.set(j.timeMandante,  j.logoMandante);
      if (j.logoVisitante) m.set(j.timeVisitante, j.logoVisitante);
    }
    // Classificação (ESPN standings) — cobre todos os 20 da Série A, sobrescreve se tiver logo melhor
    for (const e of this.classificacao()) {
      if (e.logo) m.set(e.nome, e.logo);
    }
    return m;
  });

  getLogo(nome: string): string {
    return this.logosMap().get(nome) ?? '';
  }

  temJogo(nome: string): boolean {
    const jogos = this.jogos();
    return jogos.some(j => j.timeMandante === nome || j.timeVisitante === nome);
  }

  jogosFiltrados = computed(() => {
    const time = this.timeSelecionado();
    const aoVivo = this.filtroAoVivo();
    let jogos = time
      ? this.jogos().filter(j => j.timeMandante === time || j.timeVisitante === time)
      : this.jogos();
    if (aoVivo) {
      jogos = jogos.filter(j => this.eAoVivo(j));
    }
    return [...jogos].sort((a, b) => {
      const ordemA = this.eEncerrado(a) ? 2 : this.eAoVivo(a) ? 0 : 1;
      const ordemB = this.eEncerrado(b) ? 2 : this.eAoVivo(b) ? 0 : 1;
      return ordemA - ordemB;
    });
  });

  temJogoAoVivo = computed(() => this.jogos().some(j => this.eAoVivo(j)));

  classificacaoProvisoria = computed(() => {
    const base = this.classificacao();
    if (base.length === 0) return [];

    const jogosAoVivo = this.jogos().filter(j => this.eAoVivo(j));
    if (jogosAoVivo.length === 0) return base;

    const tabela = base.map(e => ({ ...e }));

    for (const jogo of jogosAoVivo) {
      const placar = this.getPlacarJogo(jogo);
      if (!placar || placar.placarMandante === null || placar.placarVisitante === null) continue;

      const mandante = tabela.find(e => e.nome === jogo.timeMandante);
      const visitante = tabela.find(e => e.nome === jogo.timeVisitante);
      if (!mandante || !visitante) continue;

      mandante.provisorio = true;
      visitante.provisorio = true;
      mandante.jogos += 1;
      visitante.jogos += 1;
      mandante.gols += placar.placarMandante;
      mandante.golsSofridos += placar.placarVisitante;
      mandante.saldo += placar.placarMandante - placar.placarVisitante;
      visitante.gols += placar.placarVisitante;
      visitante.golsSofridos += placar.placarMandante;
      visitante.saldo += placar.placarVisitante - placar.placarMandante;

      if (placar.placarMandante > placar.placarVisitante) {
        mandante.vitorias += 1; mandante.pontos += 3;
        visitante.derrotas += 1;
      } else if (placar.placarMandante < placar.placarVisitante) {
        visitante.vitorias += 1; visitante.pontos += 3;
        mandante.derrotas += 1;
      } else {
        mandante.empates += 1; mandante.pontos += 1;
        visitante.empates += 1; visitante.pontos += 1;
      }
    }

    const posicaoOriginal = new Map(base.map(e => [e.nome, e.posicao]));

    return tabela
      .sort((a, b) => b.pontos - a.pontos || b.saldo - a.saldo)
      .map((e, i) => ({
        ...e,
        posicao: i + 1,
        posicaoAnterior: posicaoOriginal.get(e.nome),
      }));
  });

  temClassificacaoProvisoria = computed(() => this.classificacaoProvisoria().some(e => e.provisorio));

  private podeTerPlacar(jogo: Jogo): boolean {
    if (!jogo.hora || jogo.hora === '00:00') return false;
    const inicio = new Date(`${jogo.data}T${jogo.hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 6 * 60 * 60 * 1000);
    return new Date() >= inicio && new Date() < fim;
  }

  constructor(
    private jogosService: JogosService,
    private meta: Meta,
    private titleService: Title,
    private el: ElementRef,
    private swUpdate: SwUpdate,
    @Inject(DOCUMENT) private document: Document,
  ) {
    this.setupPwaUpdate();
  }

  ngOnInit(): void {
    document.addEventListener('touchstart', this.onTouchStart, { passive: true });
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd, { passive: true });

    this.carregarDados();
  }

  private carregarDados(): void {
    this.jogosService.getJogosDaSemana().subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => {
          const ta = new Date(`${a.data}T${a.hora || '00:00'}:00-03:00`).getTime();
          const tb = new Date(`${b.data}T${b.hora || '00:00'}:00-03:00`).getTime();
          return ta - tb;
        });
        this.jogos.set(sorted);
        this.loading.set(false);
        gaPush('jogos_carregados', { total_jogos: sorted.length });
        const slug = window.location.pathname.replace(/^\//, '').toLowerCase();
        if (slug === 'ao-vivo') {
          this.filtroAoVivo.set(true);
          const aoVivoDesc = 'Acompanhe os jogos de futebol ao vivo agora no Brasil — TV e streaming em tempo real.';
          this.titleService.setTitle('Ao Vivo — Onde Assistir');
          this.meta.updateTag({ property: 'og:title', content: 'Jogos Ao Vivo — Onde Assistir' });
          this.meta.updateTag({ property: 'og:description', content: aoVivoDesc });
          this.meta.updateTag({ name: 'description', content: aoVivoDesc });
          this.setCanonical('https://ondeassistir.space/ao-vivo');
        } else if (slug.startsWith('campeonato/')) {
          const ligaSlug = slug.replace('campeonato/', '');
          if (this.CAMP_SLUG_LABEL[ligaSlug]) {
            this.campeonatoSelecionado.set(ligaSlug);
            this.atualizarMetaCampeonato(ligaSlug);
            this.carregarDadosCampeonato(ligaSlug);
          }
        } else if (slug) {
          const match = this.classificacao().find(t => slugify(t.nome) === slug);
          if (match) {
            this.timeSelecionado.set(match.nome);
            this.atualizarMeta(match.nome);
            this.carregarNoticias(slug);
          }
        }
        this.atualizarSportsEvents(this.jogosFiltrados());
        this.atualizarPlacar();
        this.pollingInterval = setInterval(() => this.atualizarPlacar(), 10_000);
        this.atualizarOdds();
        this.oddsInterval = setInterval(() => this.atualizarOdds(), 5 * 60_000);
        this.atualizarClassificacao();
        this.classificacaoInterval = setInterval(() => this.atualizarClassificacao(), 5 * 60_000);
      },
      error: (err) => {
        if (err?.status === 429) {
          const delay = err?.error?.retryDelay;
          const msg = delay
            ? `Muitas requisições à IA. Tente novamente em ${delay}.`
            : 'Muitas requisições à IA. Aguarde alguns instantes e tente novamente.';
          this.error.set(msg);
        } else {
          this.error.set('Não foi possível carregar os jogos. Tente novamente mais tarde.');
        }
        this.loading.set(false);
        gaPush('jogos_erro', { status: err?.status });
      }
    });
  }

  recarregar(): void {
    if (this.atualizacaoDisponivel()) {
      window.location.reload();
      return;
    }
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate();
    }
    this.isRefreshing.set(true);
    clearInterval(this.pollingInterval);
    clearInterval(this.oddsInterval);
    clearInterval(this.classificacaoInterval);
    this.jogosService.getJogosDaSemana().subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => {
          const ta = new Date(`${a.data}T${a.hora || '00:00'}:00-03:00`).getTime();
          const tb = new Date(`${b.data}T${b.hora || '00:00'}:00-03:00`).getTime();
          return ta - tb;
        });
        this.jogos.set(sorted);
        this.error.set(null);
        this.atualizarPlacar();
        this.pollingInterval = setInterval(() => this.atualizarPlacar(), 10_000);
        this.atualizarOdds();
        this.oddsInterval = setInterval(() => this.atualizarOdds(), 5 * 60_000);
        this.atualizarClassificacao();
        this.classificacaoInterval = setInterval(() => this.atualizarClassificacao(), 5 * 60_000);
        gaPush('pull_to_refresh');
      },
      error: () => {},
      complete: () => {
        this.isRefreshing.set(false);
        this.pullDistance.set(0);
      }
    });
  }

  selecionarTime(nome: string): void {
    if (this.filtroAoVivo()) this.filtroAoVivo.set(false);
    this.timeSelecionado.set(nome);
    history.replaceState(null, '', nome ? '/' + slugify(nome) : '/');
    this.atualizarMeta(nome);
    this.atualizarSportsEvents(this.jogosFiltrados());
    if (nome) {
      this.carregarNoticias(slugify(nome));
      gaPush('filtro_time', { time: nome });
    } else {
      this.noticias.set([]);
      gaPush('filtro_todos');
    }
  }

  private readonly BASE_URL = 'https://ondeassistir.space';

  private atualizarMeta(nome: string): void {
    if (!nome) {
      const defaultTitle = 'Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil';
      const defaultDesc = 'Descubra onde assistir os jogos de futebol da semana no Brasil: Brasileirão Série A, canais de TV e plataformas de streaming.';
      this.titleService.setTitle(defaultTitle);
      this.meta.updateTag({ property: 'og:title', content: defaultTitle });
      this.meta.updateTag({ property: 'og:description', content: defaultDesc });
      this.meta.updateTag({ property: 'og:url', content: this.BASE_URL + '/' });
      this.meta.updateTag({ name: 'description', content: defaultDesc });
      this.setCanonical(this.BASE_URL + '/');
      return;
    }
    const proximo = this.jogosFiltrados().find(j => {
      const inicio = new Date(`${j.data}T${j.hora || '23:59'}:00-03:00`);
      return new Date() < inicio;
    });
    const pageTitle = `${nome} — Onde Assistir`;
    let description = `Veja onde assistir os próximos jogos do ${nome} ao vivo no Brasil.`;
    if (proximo) {
      const adversario = proximo.timeMandante === nome ? proximo.timeVisitante : proximo.timeMandante;
      const canais = [...proximo.canal, ...proximo.streaming].join(', ') || 'A confirmar';
      const [, m, d] = proximo.data.split('-');
      const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const diaSemana = diasSemana[new Date(`${proximo.data}T12:00:00-03:00`).getDay()];
      description = `Veja onde assistir os próximos jogos do ${nome} ao vivo. ${diaSemana}, ${d}/${m} — ${nome} x ${adversario} — ${canais}.`;
    }
    const url = `${this.BASE_URL}/${slugify(nome)}`;
    this.titleService.setTitle(pageTitle);
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ name: 'description', content: description });
    this.setCanonical(url);
  }

  private atualizarSportsEvents(jogos: Jogo[]): void {
    const existing = this.document.querySelector<HTMLScriptElement>('script[data-seo="sports-events"]');
    if (existing) existing.remove();
    if (jogos.length === 0) return;
    const graph = jogos.map(jogo => {
      const hora = jogo.hora && jogo.hora !== '00:00' ? jogo.hora : '00:00';
      const event: Record<string, unknown> = {
        '@type': 'SportsEvent',
        'name': `${jogo.timeMandante} x ${jogo.timeVisitante}`,
        'startDate': `${jogo.data}T${hora}:00-03:00`,
        'competitor': [
          { '@type': 'SportsTeam', 'name': jogo.timeMandante },
          { '@type': 'SportsTeam', 'name': jogo.timeVisitante },
        ],
        'sport': 'Futebol',
        'organizer': { '@type': 'Organization', 'name': this.getOrganizer(jogo.campeonato) },
        'broadcaster': [
          ...jogo.canal.map(c => ({ '@type': 'Organization', 'name': c })),
          ...jogo.streaming.map(s => ({ '@type': 'Organization', 'name': s })),
        ].filter(b => b.name),
      };
      if (jogo.estadio) event['location'] = { '@type': 'Place', 'name': jogo.estadio };
      return event;
    });
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'sports-events');
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    this.document.head.appendChild(script);
  }

  private getOrganizer(campeonato?: string): string {
    if (!campeonato) return 'CBF';
    const key = campeonato.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map: Record<string, string> = {
      'BRASILEIRAO':           'CBF',
      'BRASILEIRAO SERIE A':   'CBF',
      'BRASILEIRAO SERIE B':   'CBF',
      'COPA DO BRASIL':        'CBF',
      'LIBERTADORES':          'CONMEBOL',
      'COPA LIBERTADORES':     'CONMEBOL',
      'CONMEBOL LIBERTADORES': 'CONMEBOL',
      'SUL-AMERICANA':         'CONMEBOL',
      'COPA SUL-AMERICANA':    'CONMEBOL',
    };
    return map[key] ?? 'CBF';
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setupPwaUpdate(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => this.atualizacaoDisponivel.set(true));
    interval(30 * 60_000).subscribe(() => this.swUpdate.checkForUpdate());
  }

  aplicarAtualizacao(): void {
    window.location.reload();
  }

  private carregarNoticias(slug: string): void {
    this.jogosService.getNoticias(slug).subscribe({
      next: (data) => this.noticias.set(data),
      error: () => this.noticias.set([]),
    });
  }

  aceitarConsentimento(): void {
    localStorage.setItem('ga_consent', 'granted');
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    this.showConsentBanner.set(false);
  }

  recusarConsentimento(): void {
    localStorage.setItem('ga_consent', 'declined');
    this.showConsentBanner.set(false);
  }

  ngOnDestroy(): void {
    clearInterval(this.pollingInterval);
    clearInterval(this.oddsInterval);
    clearInterval(this.classificacaoInterval);
    clearInterval(this.campeonatoClassifInterval);
    clearTimeout(this.golToastTimer);
    document.removeEventListener('touchstart', this.onTouchStart);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('touchend', this.onTouchEnd);
  }

  getInitials = teamInitials;

  h3TextoJogo(jogo: Jogo): string {
    const data = this.formatarData(jogo.data);
    const hora = jogo.hora && jogo.hora !== '00:00' ? ` às ${jogo.hora}` : '';
    return `${jogo.timeMandante} x ${jogo.timeVisitante} — ${data}${hora}`;
  }

  private placarKey(mandante: string, visitante: string, data: string): string {
    return `${data}_${mandante}_${visitante}`;
  }

  private readonly STREAMING_URLS: Record<string, string> = {
    'Globoplay':          'https://globoplay.globo.com',
    'Premiere':           'https://globoplay.globo.com',
    'SporTV':             'https://globoplay.globo.com',
    'SporTV 2':           'https://globoplay.globo.com',
    'SporTV 3':           'https://globoplay.globo.com',
    'Cazé TV':            'https://www.youtube.com/cazetv',
    'CazéTV':             'https://www.youtube.com/cazetv',
    'Ge TV':              'https://www.youtube.com/geglobo',
    'Paramount+':         'https://www.paramountplus.com/br',
    'Amazon Prime Video': 'https://www.primevideo.com',
    'Prime Video':        'https://www.primevideo.com',
    'Disney+':            'https://www.disneyplus.com/pt-br',
    'DAZN':               'https://www.dazn.com/pt-BR',
    'TNT Sports':         'https://tntbrasil.com.br',
    'ESPN':               'https://www.espn.com.br',
    'Record':             'https://www.r7.com/ao-vivo',
    'Record TV':          'https://www.r7.com/ao-vivo',
    'SBT':                'https://www.sbt.com.br/ao-vivo',
  };

  getStreamingUrl(plataforma: string): string | null {
    return this.STREAMING_URLS[plataforma] ?? null;
  }

  private atualizarPlacar(): void {
    const temAtivo = this.jogos().some(j => this.eAoVivo(j) || this.podeTerPlacar(j));
    if (!temAtivo) return;
    this.atualizarOdds();
    this.jogosService.getPlacar().subscribe({
      next: (lista) => {
        const map = new Map<string, Placar>();
        for (const p of lista) {
          map.set(this.placarKey(p.timeMandante, p.timeVisitante, p.data), p);
        }
        this.verificarGols(map);
        this.placares.set(map);
      }
    });
  }

  private verificarGols(novosPlacar: Map<string, Placar>): void {
    const primeiraVez = this.prevGoalCounts.size === 0;
    for (const [key, placar] of novosPlacar.entries()) {
      const total = (placar.placarMandante ?? 0) + (placar.placarVisitante ?? 0);
      if (!primeiraVez && placar.status === 'em-andamento') {
        const prevTotal = this.prevGoalCounts.get(key) ?? 0;
        if (total > prevTotal) {
          this.dispararNotificacaoGol(placar);
        }
      }
      this.prevGoalCounts.set(key, total);
    }
  }

  private async dispararNotificacaoGol(placar: Placar): Promise<void> {
    const times = this.timesComNotificacao();
    const jogos = this.jogosComNotificacao();
    if (times.length === 0 && jogos.length === 0) return;

    const jogoKey = this.placarKey(placar.timeMandante, placar.timeVisitante, placar.data);
    const relevante = times.includes(placar.timeMandante) || times.includes(placar.timeVisitante)
      || jogos.includes(jogoKey);
    if (!relevante) return;

    const texto = `⚽ GOL! ${placar.timeMandante} ${placar.placarMandante} x ${placar.placarVisitante} ${placar.timeVisitante}`;
    clearTimeout(this.golToastTimer);
    this.golToast.set(texto);
    this.golToastTimer = setTimeout(() => this.golToast.set(null), 5000);

    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body: `${placar.timeMandante} ${placar.placarMandante} x ${placar.placarVisitante} ${placar.timeVisitante}`,
      icon: '/favicon/icon-512x512.svg',
      tag: `gol-${placar.timeMandante}-${placar.timeVisitante}`,
    };

    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { reg.showNotification('⚽ GOL!', options); return; }
    } catch {}
    new Notification('⚽ GOL!', options);
  }

  toggleFiltroAoVivo(): void {
    const next = !this.filtroAoVivo();
    this.filtroAoVivo.set(next);
    if (next) {
      this.timeSelecionado.set('');
      this.noticias.set([]);
      history.replaceState(null, '', '/ao-vivo');
      this.atualizarMeta('');
    } else {
      history.replaceState(null, '', '/');
      this.atualizarMeta('');
    }
    this.atualizarSportsEvents(this.jogosFiltrados());
  }

  async ativarNotificacoes(): Promise<void> {
    const selected = this.timeSelecionado();
    if (!selected) return;
    if (!('Notification' in window)) return;

    const current = this.timesComNotificacao();
    if (current.includes(selected)) {
      const next = current.filter(t => t !== selected);
      this.timesComNotificacao.set(next);
      this.salvarTimesNotificacao(next);
      return;
    }

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const next = [...current, selected];
    this.timesComNotificacao.set(next);
    this.salvarTimesNotificacao(next);
  }

  private salvarTimesNotificacao(times: string[]): void {
    try { localStorage.setItem('notif-times', JSON.stringify(times)); } catch {}
  }

  private salvarJogosNotificacao(jogos: string[]): void {
    try { localStorage.setItem('notif-jogos', JSON.stringify(jogos)); } catch {}
  }

  notifAtivaParaJogo(jogo: Jogo): boolean {
    return this.jogosComNotificacao().includes(this.placarKey(jogo.timeMandante, jogo.timeVisitante, jogo.data));
  }

  async toggleNotificacaoJogo(jogo: Jogo): Promise<void> {
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const key = this.placarKey(jogo.timeMandante, jogo.timeVisitante, jogo.data);
    const current = this.jogosComNotificacao();
    const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    this.jogosComNotificacao.set(next);
    this.salvarJogosNotificacao(next);
  }

  textoBotaoNotificacao(): string {
    const sel = this.timeSelecionado();
    if (sel) return this.notifAtivaParaTimeAtual() ? 'Notif. ativas' : 'Notificar gols';
    const n = this.timesComNotificacao().length;
    return n > 0 ? `Seguindo ${n} time${n > 1 ? 's' : ''}` : 'Gols';
  }

  tituloBotaoNotificacao(): string {
    const sel = this.timeSelecionado();
    if (!sel) return 'Selecione um time para ativar notificações de gol';
    return this.notifAtivaParaTimeAtual()
      ? `Desativar notificações de gols de ${sel}`
      : `Ativar notificações de gols de ${sel}`;
  }

  getPlacarJogo(jogo: Jogo): Placar | undefined {
    return this.placares().get(this.placarKey(jogo.timeMandante, jogo.timeVisitante, jogo.data));
  }

  private atualizarClassificacao(): void {
    this.jogosService.getClassificacao().subscribe({
      next: (lista) => this.classificacao.set(lista),
    });
  }

  private atualizarOdds(): void {
    this.jogosService.getOdds().subscribe({
      next: (lista) => {
        const map = new Map<string, Odds>();
        for (const o of lista) {
          map.set(this.placarKey(o.timeMandante, o.timeVisitante, o.data), o);
        }
        this.odds.set(map);
      }
    });
  }

  getOddsJogo(jogo: Jogo): Odds | undefined {
    return this.odds().get(this.placarKey(jogo.timeMandante, jogo.timeVisitante, jogo.data));
  }

  formatarData(dataIso: string): string {
    if (this.eHoje(dataIso)) return 'Hoje';
    const data = new Date(dataIso + 'T00:00:00');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaSemana = dias[data.getDay()];
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${diaSemana}, ${dia}/${mes}`;
  }

  eHoje(dataIso: string): boolean {
    // Compara com data de hoje no fuso BRT (UTC-3)
    const hoje = new Date();
    const brtHoje = new Date(hoje.getTime() - 3 * 60 * 60 * 1000);
    return dataIso === brtHoje.toISOString().slice(0, 10);
  }

  eAoVivo(jogo: Jogo): boolean {
    const placar = this.getPlacarJogo(jogo);
    if (placar) return placar.status === 'em-andamento';
    if (!jogo.hora || jogo.hora === '00:00') return false;
    const inicio = new Date(`${jogo.data}T${jogo.hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
    const agora = new Date();
    return agora >= inicio && agora < fim;
  }

  eEncerrado(jogo: Jogo): boolean {
    return this.getPlacarJogo(jogo)?.status === 'encerrado';
  }

  eJogoFuturo(jogo: Jogo): boolean {
    if (!jogo.hora || jogo.hora === '00:00') return true;
    const inicio = new Date(`${jogo.data}T${jogo.hora}:00-03:00`);
    return new Date() < inicio;
  }

  mostrarOndeAssistir(jogo: Jogo): boolean {
    const brtHoje = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    const limite = new Date(brtHoje);
    limite.setDate(limite.getDate() + 3);
    return jogo.data <= limite.toISOString().slice(0, 10);
  }

  buildCalendarUrl(jogo: Jogo): string {
    const titulo = `${jogo.timeMandante} x ${jogo.timeVisitante}`;
    const camp = jogo.campeonato ? ` — ${jogo.campeonato}` : '';
    const text = encodeURIComponent(titulo + camp);

    const hora = jogo.hora && jogo.hora !== '00:00' ? jogo.hora : '12:00';
    const inicio = new Date(`${jogo.data}T${hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const startUtc = fmt(inicio);
    const endUtc = fmt(fim);

    const canais = [...jogo.canal, ...jogo.streaming].join(', ') || 'A confirmar';
    const details = encodeURIComponent(`Onde assistir: ${canais}`);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${text}&dates=${startUtc}/${endUtc}&details=${details}`;
  }
}
