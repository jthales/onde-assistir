import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Copa2026Service } from '../services/copa-2026.service';
import { ClassificacaoEntry, ClassificacaoResponse, Jogo, Placar } from '../models/jogo';
import { translateCountry } from './country-names';

function formatarData(dataIso: string): string {
  const hoje = new Date();
  const brtHoje = new Date(hoje.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dataIso === brtHoje) return 'Hoje';
  const data = new Date(dataIso + 'T00:00:00');
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dias[data.getDay()]}, ${dia}/${mes}`;
}

interface Regressiva { dias: number; horas: number; minutos: number; segundos: number }

@Component({
  selector: 'app-copa-2026',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './copa-2026.component.html',
  styleUrl: './copa-2026.component.scss',
})
export class Copa2026Component implements OnInit, OnDestroy {
  loading = signal(true);
  erro = signal<string | null>(null);
  classificacao = signal<ClassificacaoResponse | null>(null);
  jogos = signal<Jogo[]>([]);
  placares = signal<Map<string, Placar>>(new Map());

  private classificacaoInterval?: ReturnType<typeof setInterval>;
  private jogosInterval?: ReturnType<typeof setInterval>;
  private placarInterval?: ReturnType<typeof setInterval>;
  private regressivaTimer?: ReturnType<typeof setInterval>;

  readonly regressiva = signal<Regressiva>(this.calcularRegressiva());
  readonly copaComecou = computed(() => new Date() >= new Date('2026-06-11T12:00:00-03:00'));

  readonly translateCountry = translateCountry;

  readonly jogosPorGrupo = computed(() => {
    const classif = this.classificacao();
    if (classif?.tipo !== 'grupos') return new Map<string, Jogo[]>();
    const map = new Map<string, Jogo[]>();
    for (const grupo of classif.grupos) {
      const nomes = new Set(grupo.times.map(t => t.nome));
      const jogosGrupo = this.jogos()
        .filter(j => nomes.has(translateCountry(j.timeMandante)) && nomes.has(translateCountry(j.timeVisitante)))
        .sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
      map.set(grupo.nome, jogosGrupo);
    }
    return map;
  });

  readonly rodadasPorGrupo = computed(() => {
    const result = new Map<string, { rodada: number; jogos: Jogo[] }[]>();
    for (const [nome, jogos] of this.jogosPorGrupo()) {
      const byDate = new Map<string, Jogo[]>();
      for (const j of jogos) {
        if (!byDate.has(j.data)) byDate.set(j.data, []);
        byDate.get(j.data)!.push(j);
      }
      result.set(nome, Array.from(byDate.keys()).sort().map((d, i) => ({ rodada: i + 1, jogos: byDate.get(d)! })));
    }
    return result;
  });

  aproveitamento(entry: ClassificacaoEntry): number {
    if (entry.jogos === 0) return 0;
    return Math.round((entry.pontos / (entry.jogos * 3)) * 100);
  }

  constructor(private copaSvc: Copa2026Service) {}

  ngOnInit(): void {
    this.carregarClassificacao();
    this.carregarJogos();
    this.carregarPlacares();

    this.regressivaTimer        = setInterval(() => this.regressiva.set(this.calcularRegressiva()), 1000);
    this.classificacaoInterval  = setInterval(() => this.carregarClassificacao(), 3 * 60_000);
    this.jogosInterval          = setInterval(() => this.carregarJogos(), 5 * 60_000);
    this.placarInterval         = setInterval(() => this.carregarPlacares(), 10_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.regressivaTimer);
    clearInterval(this.classificacaoInterval);
    clearInterval(this.jogosInterval);
    clearInterval(this.placarInterval);
  }

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

  private carregarClassificacao(): void {
    this.copaSvc.getClassificacao().subscribe({
      next: (data) => {
        this.classificacao.set(data);
        this.loading.set(false);
        this.erro.set(null);
      },
      error: () => {
        this.loading.set(false);
        if (!this.classificacao()) this.erro.set('Não foi possível carregar os dados da Copa.');
      },
    });
  }

  private carregarJogos(): void {
    this.copaSvc.getJogos().subscribe({
      next: (jogos) => this.jogos.set(jogos),
      error: () => {},
    });
  }

  private carregarPlacares(): void {
    this.copaSvc.getPlacar().subscribe({
      next: (placares) => {
        const mapa = new Map<string, Placar>();
        for (const p of placares) {
          mapa.set(`${p.timeMandante}|${p.timeVisitante}`, p);
        }
        this.placares.set(mapa);
      },
      error: () => {},
    });
  }

  getPlacarJogo(jogo: Jogo): Placar | undefined {
    return this.placares().get(`${jogo.timeMandante}|${jogo.timeVisitante}`);
  }

  eAoVivo(jogo: Jogo): boolean {
    return this.getPlacarJogo(jogo)?.status === 'em-andamento';
  }

  formatarData(dataIso: string): string {
    return formatarData(dataIso);
  }

  temJogosAoVivo(): boolean {
    for (const p of this.placares().values()) {
      if (p.status === 'em-andamento') return true;
    }
    return false;
  }

  placoresAoVivo(): Placar[] {
    return Array.from(this.placares().values()).filter(p => p.status === 'em-andamento');
  }
}
