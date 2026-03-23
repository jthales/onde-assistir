import { Component, OnInit, OnDestroy, signal, computed, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { interval } from 'rxjs';
import { JogosService } from './services/jogos.service';
import { Jogo, Placar, Odds, ClassificacaoEntry, Noticia } from './models/jogo';
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
  showConsentBanner = signal(localStorage.getItem('ga_consent') === null);
  placares = signal<Map<string, Placar>>(new Map());
  odds = signal<Map<string, Odds>>(new Map());
  classificacao = signal<ClassificacaoEntry[]>([]);
  noticias = signal<Noticia[]>([]);
  atualizacaoDisponivel = signal(false);
  pullDistance = signal(0);
  isPulling = signal(false);
  isRefreshing = signal(false);

  private pollingInterval?: ReturnType<typeof setInterval>;
  private oddsInterval?: ReturnType<typeof setInterval>;
  private classificacaoInterval?: ReturnType<typeof setInterval>;

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

  times = computed(() => {
    const map = new Map<string, string>();
    for (const j of this.jogos()) {
      if (!map.has(j.timeMandante)) map.set(j.timeMandante, j.logoMandante ?? '');
      if (!map.has(j.timeVisitante)) map.set(j.timeVisitante, j.logoVisitante ?? '');
    }
    return Array.from(map.entries())
      .map(([nome, logo]) => ({ nome, logo }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

  jogosFiltrados = computed(() => {
    const time = this.timeSelecionado();
    const jogos = time
      ? this.jogos().filter(j => j.timeMandante === time || j.timeVisitante === time)
      : this.jogos();
    return [...jogos].sort((a, b) => {
      const ordemA = this.eEncerrado(a) ? 2 : this.eAoVivo(a) ? 0 : 1;
      const ordemB = this.eEncerrado(b) ? 2 : this.eAoVivo(b) ? 0 : 1;
      return ordemA - ordemB;
    });
  });

  temJogoAoVivo = computed(() => this.jogosFiltrados().some(j => this.eAoVivo(j)));

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

    return tabela
      .sort((a, b) => b.pontos - a.pontos || b.saldo - a.saldo)
      .map((e, i) => ({ ...e, posicao: i + 1 }));
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
        if (slug) {
          const match = this.times().find(t => slugify(t.nome) === slug);
          if (match) {
            this.timeSelecionado.set(match.nome);
            this.atualizarMeta(match.nome);
            this.carregarNoticias(slug);
          }
        }
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
    this.timeSelecionado.set(nome);
    history.replaceState(null, '', nome ? '/' + slugify(nome) : '/');
    this.atualizarMeta(nome);
    if (nome) {
      this.carregarNoticias(slugify(nome));
      gaPush('filtro_time', { time: nome });
    } else {
      this.noticias.set([]);
      gaPush('filtro_todos');
    }
  }

  private atualizarMeta(nome: string): void {
    const baseUrl = 'https://onde-assistir-five.vercel.app';
    if (!nome) {
      this.titleService.setTitle('Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil');
      this.meta.updateTag({ property: 'og:title', content: 'Onde Assistir — Futebol ao Vivo: TV e Streaming no Brasil' });
      this.meta.updateTag({ property: 'og:description', content: 'Veja onde assistir os jogos de futebol desta semana no Brasil.' });
      this.meta.updateTag({ property: 'og:url', content: baseUrl });
      return;
    }
    const proximo = this.jogosFiltrados().find(j => {
      const inicio = new Date(`${j.data}T${j.hora || '23:59'}:00-03:00`);
      return new Date() < inicio;
    });
    const title = `${nome} — Onde Assistir`;
    let description = `Veja todos os jogos do ${nome} desta semana e onde assistir.`;
    if (proximo) {
      const adversario = proximo.timeMandante === nome ? proximo.timeVisitante : proximo.timeMandante;
      const canais = [...proximo.canal, ...proximo.streaming].join(', ') || 'A confirmar';
      const [, m, d] = proximo.data.split('-');
      description = `${nome} x ${adversario} em ${d}/${m}. Assista em: ${canais}.`;
    }
    this.titleService.setTitle(title);
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: `${baseUrl}/${slugify(nome)}` });
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
    document.removeEventListener('touchstart', this.onTouchStart);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('touchend', this.onTouchEnd);
  }

  getInitials = teamInitials;

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
    'Amazon Prime Video': 'https://www.primevideo.com',
    'Prime Video':        'https://www.primevideo.com',
    'Disney+':            'https://www.disneyplus.com/pt-br',
    'DAZN':               'https://www.dazn.com/pt-BR',
    'TNT Sports':         'https://tntbrasil.com.br',
    'ESPN':               'https://www.espn.com.br',
  };

  getStreamingUrl(plataforma: string): string | null {
    return this.STREAMING_URLS[plataforma] ?? null;
  }

  private atualizarPlacar(): void {
    const temAtivo = this.jogos().some(j => this.eAoVivo(j) || this.podeTerPlacar(j));
    if (!temAtivo) return;
    this.jogosService.getPlacar().subscribe({
      next: (lista) => {
        const map = new Map<string, Placar>();
        for (const p of lista) {
          map.set(this.placarKey(p.timeMandante, p.timeVisitante, p.data), p);
        }
        this.placares.set(map);
      }
    });
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
