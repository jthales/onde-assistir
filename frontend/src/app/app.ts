import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JogosService } from './services/jogos.service';
import { Jogo } from './models/jogo';
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
  styleUrl: './app.css'
})
export class App implements OnInit {
  jogos = signal<Jogo[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  timeSelecionado = signal<string>('');
  showConsentBanner = signal(localStorage.getItem('ga_consent') === null);

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

  constructor(private jogosService: JogosService) {}

  ngOnInit(): void {
    this.jogosService.getJogosDaSemana().subscribe({
      next: (data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
        );
        this.jogos.set(sorted);
        this.loading.set(false);
        gaPush('jogos_carregados', { total_jogos: sorted.length });
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

  getInitials = teamInitials;

  formatarData(dataIso: string): string {
    const data = new Date(dataIso + 'T00:00:00');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaSemana = dias[data.getDay()];
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${diaSemana}, ${dia}/${mes}`;
  }
}
