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

  gruposCache = signal<ClassificacaoResponse | null>(null);
  gruposLoading = signal(false);

  faseIdxGeral = signal(1); // 0 = Fase de Grupos; 1+ = fases eliminatórias
  private mmFaseIniciada = false;

  private classificacaoInterval?: ReturnType<typeof setInterval>;
  private jogosInterval?: ReturnType<typeof setInterval>;
  private placarInterval?: ReturnType<typeof setInterval>;
  private regressivaTimer?: ReturnType<typeof setInterval>;

  readonly regressiva = signal<Regressiva>(this.calcularRegressiva());
  readonly copaComecou = computed(() => new Date() >= new Date('2026-06-11T12:00:00-03:00'));

  readonly translateCountry = translateCountry;

  readonly estaEmFaseGrupos = computed(() => this.faseIdxGeral() === 0);

  readonly classificacaoExibida = computed(() =>
    this.estaEmFaseGrupos() && this.gruposCache()
      ? this.gruposCache()!
      : this.classificacao()
  );

  // Usa classificacao() diretamente para evitar dependência circular com classificacaoExibida
  readonly fasesMataMata = computed(() => {
    const seen = new Set<string>(); const fases: string[] = [];
    for (const c of this.classificacao()?.confrontos ?? [])
      if (c.fase && !seen.has(c.fase)) { seen.add(c.fase); fases.push(c.fase); }
    return fases;
  });

  readonly fasesGerais = computed(() => ['Fase de Grupos', ...this.fasesMataMata()]);

  readonly confrontosFaseMM = computed(() => {
    const fase = this.fasesMataMata()[this.faseIdxGeral() - 1];
    return (this.classificacao()?.confrontos ?? []).filter(c => c.fase === fase);
  });

  readonly tituloFaseGeral = computed(() =>
    this.fasesGerais()[this.faseIdxGeral()] ?? this.classificacao()?.faseAtual ?? ''
  );

  readonly jogosPorGrupo = computed(() => {
    const classif = this.classificacaoExibida();
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
      const rodadas: { rodada: number; jogos: Jogo[] }[] = [];
      for (let i = 0; i < jogos.length; i += 2) {
        rodadas.push({ rodada: Math.floor(i / 2) + 1, jogos: jogos.slice(i, i + 2) });
      }
      result.set(nome, rodadas);
    }
    return result;
  });

  readonly rodadaAtualPorGrupo = computed(() => {
    const result = new Map<string, { rodada: number; jogos: Jogo[] } | null>();
    const placares = this.placares();
    for (const [nome, rodadas] of this.rodadasPorGrupo()) {
      if (rodadas.length === 0) { result.set(nome, null); continue; }
      let atual = rodadas[rodadas.length - 1];
      for (const rodada of rodadas) {
        const todosEncerrados = rodada.jogos.every(j => {
          const p = placares.get(`${j.timeMandante}|${j.timeVisitante}`);
          return p?.status === 'encerrado';
        });
        if (!todosEncerrados) { atual = rodada; break; }
      }
      result.set(nome, atual);
    }
    return result;
  });

  readonly temJogosAgrupados = computed(() => {
    for (const jogos of this.jogosPorGrupo().values()) {
      if (jogos.length > 0) return true;
    }
    return false;
  });

  readonly rodadasOverridePorGrupo = signal<Map<string, number>>(new Map());

  getRodadaGrupo(grupoNome: string): number {
    const override = this.rodadasOverridePorGrupo().get(grupoNome);
    if (override != null) return override;
    return this.rodadaAtualPorGrupo().get(grupoNome)?.rodada ?? 1;
  }

  getRodadaAtualGrupo(grupoNome: string): { rodada: number; jogos: Jogo[] } | undefined {
    return (this.rodadasPorGrupo().get(grupoNome) ?? [])[this.getRodadaGrupo(grupoNome) - 1];
  }

  temRodadaAnterior(grupoNome: string): boolean {
    return this.getRodadaGrupo(grupoNome) > 1;
  }

  temProximaRodada(grupoNome: string): boolean {
    const total = (this.rodadasPorGrupo().get(grupoNome) ?? []).length;
    return this.getRodadaGrupo(grupoNome) < total;
  }

  irRodadaAnterior(grupoNome: string): void {
    const atual = this.getRodadaGrupo(grupoNome);
    if (atual <= 1) return;
    const mapa = new Map(this.rodadasOverridePorGrupo());
    mapa.set(grupoNome, atual - 1);
    this.rodadasOverridePorGrupo.set(mapa);
  }

  irProximaRodada(grupoNome: string): void {
    const total = (this.rodadasPorGrupo().get(grupoNome) ?? []).length;
    const atual = this.getRodadaGrupo(grupoNome);
    if (atual >= total) return;
    const mapa = new Map(this.rodadasOverridePorGrupo());
    mapa.set(grupoNome, atual + 1);
    this.rodadasOverridePorGrupo.set(mapa);
  }

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
        if (data.tipo === 'mata-mata' && !this.mmFaseIniciada) {
          const fases: string[] = []; const seen = new Set<string>();
          for (const c of data.confrontos ?? [])
            if (c.fase && !seen.has(c.fase)) { seen.add(c.fase); fases.push(c.fase); }
          const idx = data.faseAtual ? fases.indexOf(data.faseAtual) : -1;
          // +1 porque índice 0 é reservado para "Fase de Grupos"
          this.faseIdxGeral.set(idx >= 0 ? idx + 1 : Math.max(1, fases.length));
          this.mmFaseIniciada = true;
        }
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

  irFaseAnteriorMM(): void {
    const newIdx = this.faseIdxGeral() - 1;
    if (newIdx < 0) return;
    this.faseIdxGeral.set(newIdx);
    if (newIdx === 0 && !this.gruposCache()) {
      this.gruposLoading.set(true);
      this.copaSvc.getGruposClassificacao().subscribe({
        next: (data) => { this.gruposCache.set(data); this.gruposLoading.set(false); },
        error: () => this.gruposLoading.set(false),
      });
    }
  }

  irProximaFaseMM(): void {
    if (this.faseIdxGeral() < this.fasesGerais().length - 1) this.faseIdxGeral.update(i => i + 1);
  }

  temFaseAnteriorMM(): boolean { return this.faseIdxGeral() > 0; }
  temProximaFaseMM(): boolean { return this.faseIdxGeral() < this.fasesGerais().length - 1; }

  getMelhoresMomentosMataMata(time1Nome: string, time2Nome: string): string | undefined {
    return this.jogos().find(j =>
      (j.timeMandante === time1Nome && j.timeVisitante === time2Nome) ||
      (j.timeMandante === time2Nome && j.timeVisitante === time1Nome)
    )?.melhoresMomentos;
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

  readonly classificacaoProvisoria = computed(() => {
    const classif = this.classificacaoExibida();
    if (!classif || classif.tipo !== 'grupos') return classif;

    const aoVivo = Array.from(this.placares().values()).filter(p => p.status === 'em-andamento');
    if (aoVivo.length === 0) return classif;

    const grupos = classif.grupos.map(grupo => ({
      ...grupo,
      times: grupo.times.map(t => ({ ...t })),
    }));

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

    return { ...classif, grupos };
  });

  readonly temClassificacaoProvisoria = computed(() => {
    const c = this.classificacaoProvisoria();
    return c?.grupos.some(g => g.times.some(t => t.provisorio)) ?? false;
  });
}
