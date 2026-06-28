import { Component, OnInit, OnDestroy, signal, computed, ElementRef, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { interval, forkJoin } from 'rxjs';
import { JogosService } from './services/jogos.service';
import { PushNotificacaoService } from './services/push-notificacao.service';
import { Jogo, Placar, Odds, ClassificacaoEntry, Noticia, ClassificacaoResponse, JogoCampeonato, GrupoClassificacao } from './models/jogo';
import { track } from '@vercel/analytics';
import { teamInitials } from './team-logos';
import { Copa2026Component } from './copa-2026/copa-2026.component';
import { translateCountry } from './copa-2026/country-names';
import { Copa2026Service } from './services/copa-2026.service';
import { APP_VERSION } from './version';

interface Regressiva { dias: number; horas: number; minutos: number; segundos: number }

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function analyticsTrack(event: string, params: Record<string, string | number | boolean | undefined> = {}): void {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) data[key] = String(value);
  }
  if (Object.keys(data).length > 0) {
    track(event, data);
  } else {
    track(event);
  }
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, Copa2026Component],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  jogos = signal<Jogo[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  timeSelecionado = signal<string>('');
  filtroAoVivo = signal(false);
  filtroBrasil = signal(false);
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
  notifToast = signal<string | null>(null);
  pullDistance = signal(0);
  isPulling = signal(false);
  isRefreshing = signal(false);

  readonly currentYear = new Date().getFullYear();
  readonly appVersion = APP_VERSION;

  campeonatoSelecionado = signal<string>('');
  classificacaoCampeonato = signal<ClassificacaoResponse | null>(null);
  classificacaoCopaSidebar = signal<ClassificacaoResponse | null>(null);
  copaGrupos = signal<GrupoClassificacao[]>([]);
  jogosCampeonato = signal<JogoCampeonato[]>([]);
  noticiasCampeonato = signal<Noticia[]>([]);
  loadingCampeonato = signal(false);

  readonly isCopaPeriod = computed(() => {
    const agora = new Date();
    return (agora >= new Date('2026-06-01T00:00:00') && agora <= new Date('2026-07-22T23:59:59'))
      || window.location.pathname.startsWith('/copa-2026');
  });

  readonly isCopa2026Route = signal(window.location.pathname.startsWith('/copa-2026'));

  readonly copaComecou = computed(() => new Date() >= new Date('2026-06-11T12:00:00-03:00'));

  readonly regressiva = signal<Regressiva>(this.calcularRegressiva());

  private calcularRegressiva(): Regressiva {
    const inicio = new Date('2026-06-11T12:00:00-03:00');
    const diff = Math.max(0, inicio.getTime() - Date.now());
    return {
      dias:     Math.floor(diff / 86_400_000),
      horas:    Math.floor((diff % 86_400_000) / 3_600_000),
      minutos:  Math.floor((diff % 3_600_000) / 60_000),
      segundos: Math.floor((diff % 60_000) / 1000),
    };
  }

  private pollingInterval?: ReturnType<typeof setInterval>;
  private oddsInterval?: ReturnType<typeof setInterval>;
  private classificacaoInterval?: ReturnType<typeof setInterval>;
  private campeonatoClassifInterval?: ReturnType<typeof setInterval>;
  private regressivaTimer?: ReturnType<typeof setInterval>;
  private notifToastTimer?: ReturnType<typeof setTimeout>;
  private golToastTimer?: ReturnType<typeof setTimeout>;
  private prevGoalCounts = new Map<string, number>();
  private isLoadingPlacar = false;
  private isLoadingOdds = false;
  private isLoadingClassificacao = false;

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
    'COPA DO MUNDO 2026':    'copa-2026',
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
    if (slug === 'copa-2026') {
      this.timeSelecionado.set('');
      this.filtroAoVivo.set(false);
      this.campeonatoSelecionado.set('');
      this.noticias.set([]);
      this.isCopa2026Route.set(true);
      history.replaceState(null, '', '/copa-2026');
      analyticsTrack('ver_copa_2026');
      return;
    }
    this.timeSelecionado.set('');
    this.filtroAoVivo.set(false);
    this.isCopa2026Route.set(false);
    this.noticias.set([]);
    this.campeonatoSelecionado.set(slug);
    history.replaceState(null, '', `/campeonato/${slug}`);
    this.atualizarMetaCampeonato(slug);
    this.carregarDadosCampeonato(slug);
    analyticsTrack('ver_campeonato', { campeonato: slug });
  }

  voltarParaHome(): void {
    this.campeonatoSelecionado.set('');
    this.isCopa2026Route.set(false);
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
    const brasil = this.filtroBrasil();
    let jogos = time
      ? this.jogos().filter(j => j.timeMandante === time || j.timeVisitante === time)
      : this.jogos();
    if (brasil) {
      jogos = jogos.filter(j => j.timeMandante === 'Brasil' || j.timeVisitante === 'Brasil');
    }
    if (aoVivo) {
      jogos = jogos.filter(j => this.eAoVivo(j));
    }
    return [...jogos].sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      const ordemA = this.eEncerrado(a) ? 2 : this.eAoVivo(a) ? 0 : 1;
      const ordemB = this.eEncerrado(b) ? 2 : this.eAoVivo(b) ? 0 : 1;
      if (ordemA !== ordemB) return ordemA - ordemB;
      return (a.hora || '99:99').localeCompare(b.hora || '99:99');
    });
  });

  temJogoAoVivo = computed(() => this.jogos().some(j => this.eAoVivo(j)));

  readonly jogosAoVivoDestaque = computed(() => this.jogos().filter(j => this.eAoVivo(j)));

  classificacaoProvisoria = computed(() => {
    const base = this.classificacao();
    if (base.length === 0) return [];

    const jogosAoVivo = this.jogos().filter(j => this.eAoVivo(j) && j.campeonato === 'Brasileirão');
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

  copaGruposProvisorio = computed(() => {
    const base = this.copaGrupos();
    if (base.length === 0) return base;

    const aoVivo = Array.from(this.placares().values()).filter(p => p.status === 'em-andamento');
    if (aoVivo.length === 0) return base;

    const grupos = base.map(g => ({ ...g, times: g.times.map(t => ({ ...t })) }));

    for (const placar of aoVivo) {
      if (placar.placarMandante === null || placar.placarVisitante === null) continue;
      for (const grupo of grupos) {
        const mandante = grupo.times.find(t => t.nome === placar.timeMandante);
        const visitante = grupo.times.find(t => t.nome === placar.timeVisitante);
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

        grupo.times.sort((a, b) => b.pontos - a.pontos || b.saldo - a.saldo || b.gols - a.gols);
      }
    }

    return grupos;
  });

  temCopaProvisorio = computed(() => this.copaGruposProvisorio().some(g => g.times.some(t => t.provisorio)));

  private podeTerPlacar(jogo: Jogo): boolean {
    if (!jogo.hora || jogo.hora === '00:00') return false;
    const inicio = new Date(`${jogo.data}T${jogo.hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 6 * 60 * 60 * 1000);
    return new Date() >= inicio && new Date() < fim;
  }

  private fcmToken: string | null = null;

  constructor(
    private jogosService: JogosService,
    private pushService: PushNotificacaoService,
    private copa2026Service: Copa2026Service,
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

    this.regressivaTimer = setInterval(() => this.regressiva.set(this.calcularRegressiva()), 1000);
    this.carregarDados();
    if (this.isCopaPeriod()) {
      this.copa2026Service.getClassificacao().subscribe({
        next: (r) => {
          if (r.tipo === 'grupos') this.copaGrupos.set(r.grupos);
          this.classificacaoCopaSidebar.set(r);
        },
      });
    }
  }

  private carregarDados(): void {
    forkJoin({
      jogos: this.jogosService.getJogosDaSemana(),
      classificacao: this.jogosService.getClassificacao(),
    }).subscribe({
      next: ({ jogos, classificacao }) => {
        const sorted = [...jogos].sort((a, b) => {
          const ta = new Date(`${a.data}T${a.hora || '00:00'}:00-03:00`).getTime();
          const tb = new Date(`${b.data}T${b.hora || '00:00'}:00-03:00`).getTime();
          return ta - tb;
        });
        this.jogos.set(sorted);
        this.classificacao.set(classificacao);
        this.loading.set(false);
        analyticsTrack('jogos_carregados', { total_jogos: sorted.length });
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
        analyticsTrack('jogos_erro', { status: err?.status });
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
        analyticsTrack('pull_to_refresh');
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
    if (this.filtroBrasil()) this.filtroBrasil.set(false);
    this.timeSelecionado.set(nome);
    history.replaceState(null, '', nome ? '/' + slugify(nome) : '/');
    this.atualizarMeta(nome);
    this.atualizarSportsEvents(this.jogosFiltrados());
    if (nome) {
      this.carregarNoticias(slugify(nome));
      analyticsTrack('filtro_time', { time: nome });
    } else {
      this.noticias.set([]);
      analyticsTrack('filtro_todos');
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

  ngOnDestroy(): void {
    clearInterval(this.pollingInterval);
    clearInterval(this.oddsInterval);
    clearInterval(this.classificacaoInterval);
    clearInterval(this.campeonatoClassifInterval);
    clearInterval(this.regressivaTimer);
    clearTimeout(this.golToastTimer);
    document.removeEventListener('touchstart', this.onTouchStart);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('touchend', this.onTouchEnd);
  }

  getInitials = teamInitials;
  readonly translateCountry = translateCountry;

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
    const temAtivo = this.isCopaPeriod() || this.jogos().some(j => this.eAoVivo(j) || this.podeTerPlacar(j));
    if (!temAtivo || this.isLoadingPlacar) return;
    this.isLoadingPlacar = true;
    this.jogosService.getPlacar().subscribe({
      next: (lista) => {
        const map = new Map<string, Placar>();
        for (const p of lista) {
          map.set(this.placarKey(p.timeMandante, p.timeVisitante, p.data), p);
        }
        this.verificarGols(map);
        this.placares.set(map);
      },
      complete: () => { this.isLoadingPlacar = false; },
      error: () => { this.isLoadingPlacar = false; },
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
      this.filtroBrasil.set(false);
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

  toggleFiltroBrasil(): void {
    const next = !this.filtroBrasil();
    this.filtroBrasil.set(next);
    if (next) {
      this.filtroAoVivo.set(false);
      this.timeSelecionado.set('');
    }
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
      this.mostrarNotifToast(`🔕 Notificações desativadas para ${selected}`);
      analyticsTrack('notif_time', { time: selected, acao: 'desativar' });
      if (this.fcmToken) {
        if (next.length === 0 && this.jogosComNotificacao().length === 0) {
          this.pushService.removerSubscricao(this.fcmToken);
        } else {
          this.pushService.salvarSubscricao(this.fcmToken, next, this.jogosComNotificacao());
        }
      }
      return;
    }

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const next = [...current, selected];
    this.timesComNotificacao.set(next);
    this.salvarTimesNotificacao(next);
    this.mostrarNotifToast(`🔔 Notificações ativadas para ${selected}`);
    analyticsTrack('notif_time', { time: selected, acao: 'ativar' });
    await this.sincronizarFcmSubscricao(next, this.jogosComNotificacao());
  }

  private mostrarNotifToast(msg: string): void {
    clearTimeout(this.notifToastTimer);
    this.notifToast.set(msg);
    this.notifToastTimer = setTimeout(() => this.notifToast.set(null), 3000);
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
    const ativando = !current.includes(key);
    const next = ativando ? [...current, key] : current.filter(k => k !== key);
    this.jogosComNotificacao.set(next);
    this.salvarJogosNotificacao(next);
    const label = `${jogo.timeMandante} x ${jogo.timeVisitante}`;
    this.mostrarNotifToast(ativando ? `🔔 Notificando ${label}` : `🔕 Notificações desativadas para ${label}`);
    analyticsTrack('notif_jogo', {
      jogo: label,
      time_mandante: jogo.timeMandante,
      time_visitante: jogo.timeVisitante,
      acao: ativando ? 'ativar' : 'desativar',
    });

    const times = this.timesComNotificacao();
    if (!ativando && next.length === 0 && times.length === 0 && this.fcmToken) {
      this.pushService.removerSubscricao(this.fcmToken);
    } else {
      await this.sincronizarFcmSubscricao(times, next);
    }
  }

  private async sincronizarFcmSubscricao(times: string[], jogos: string[]): Promise<void> {
    if (times.length === 0 && jogos.length === 0) return;
    try {
      if (!this.fcmToken) {
        this.fcmToken = await this.pushService.getToken();
      }
      if (this.fcmToken) {
        this.pushService.salvarSubscricao(this.fcmToken, times, jogos);
      }
    } catch {}
  }

  textoBotaoNotificacao(): string {
    const sel = this.timeSelecionado();
    if (sel) return this.notifAtivaParaTimeAtual() ? 'Notificações ativas' : 'Notificar gols';
    return 'Gols';
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
    if (this.isLoadingClassificacao) return;
    this.isLoadingClassificacao = true;
    this.jogosService.getClassificacao().subscribe({
      next: (lista) => this.classificacao.set(lista),
      complete: () => { this.isLoadingClassificacao = false; },
      error: () => { this.isLoadingClassificacao = false; },
    });
  }

  private atualizarOdds(): void {
    if (this.isLoadingOdds) return;
    this.isLoadingOdds = true;
    this.jogosService.getOdds().subscribe({
      next: (lista) => {
        const map = new Map<string, Odds>();
        for (const o of lista) {
          map.set(this.placarKey(o.timeMandante, o.timeVisitante, o.data), o);
        }
        this.odds.set(map);
      },
      complete: () => { this.isLoadingOdds = false; },
      error: () => { this.isLoadingOdds = false; },
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
    if (jogo.canal.length > 0 || jogo.streaming.length > 0) return true;
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
