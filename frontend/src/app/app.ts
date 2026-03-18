import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JogosService } from './services/jogos.service';
import { Jogo, Placar, Odds } from './models/jogo';
import { teamInitials } from './team-logos';

declare global {
  interface Window { gtag: (...args: any[]) => void; }
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
  private pollingInterval?: ReturnType<typeof setInterval>;
  private oddsInterval?: ReturnType<typeof setInterval>;

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
    if (!time) return this.jogos();
    return this.jogos().filter(
      j => j.timeMandante === time || j.timeVisitante === time
    );
  });

  temJogoAoVivo = computed(() => this.jogosFiltrados().some(j => this.eAoVivo(j)));

  constructor(private jogosService: JogosService) {}

  ngOnInit(): void {
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
        this.atualizarPlacar();
        this.pollingInterval = setInterval(() => this.atualizarPlacar(), 10_000);
        this.atualizarOdds();
        this.oddsInterval = setInterval(() => this.atualizarOdds(), 5 * 60_000);
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

  selecionarTime(nome: string): void {
    this.timeSelecionado.set(nome);
    if (nome) {
      gaPush('filtro_time', { time: nome });
    } else {
      gaPush('filtro_todos');
    }
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
  }

  getInitials = teamInitials;

  private placarKey(mandante: string, visitante: string, data: string): string {
    return `${data}_${mandante}_${visitante}`;
  }

  private readonly STREAMING_URLS: Record<string, string> = {
    'Globoplay':          'https://globoplay.globo.com',
    'Cazé TV':            'https://www.youtube.com/@CazeTVOficial',
    'CazéTV':             'https://www.youtube.com/@CazeTVOficial',
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
    const temVivo = this.jogosFiltrados().some(j => this.eAoVivo(j));
    if (!temVivo) return;
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
    if (!jogo.hora || jogo.hora === '00:00') return false;
    // hora está em BRT → monta datetime com offset -03:00
    const inicio = new Date(`${jogo.data}T${jogo.hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000); // +2h
    const agora = new Date();
    return agora >= inicio && agora < fim;
  }
}
