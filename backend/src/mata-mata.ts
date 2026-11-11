// Montagem da fase eliminatória (mata-mata) a partir de eventos do scoreboard da ESPN.
// Funções puras: recebem os eventos já buscados, para poderem ser testadas sem rede.

export const FASE_SLUG_TO_PT: Record<string, string> = {
  'group-stage':             'Fase de Grupos',
  'league-phase':            'Fase de Liga',
  'first-round':             'Primeira Fase',
  'second-round':            'Segunda Fase',
  'third-round':             'Terceira Fase',
  'fourth-round':            'Quarta Fase',
  'fifth-round':             'Quinta Fase',
  'knockout-round-playoffs': 'Playoffs',
  'knockout-playoffs':       'Playoffs',
  'playoffs':                'Playoffs',
  'round-of-32':             'Dezesseis-avos de Final',
  'round-of-16':             'Oitavas de Final',
  'quarterfinals':           'Quartas de Final',
  'quarter-finals':          'Quartas de Final',
  'semifinals':              'Semifinal',
  'semi-finals':             'Semifinal',
  'third-place':             'Terceiro Lugar',
  'final':                   'Final',
};

/** Ordem cronológica das fases eliminatórias (fases fora da lista vão para o início). */
const ORDEM_FASES = [
  'first-round', 'second-round', 'third-round', 'fourth-round', 'fifth-round',
  'knockout-round-playoffs', 'knockout-playoffs', 'playoffs',
  'round-of-32', 'round-of-16',
  'quarterfinals', 'quarter-finals', 'semifinals', 'semi-finals', 'third-place', 'final',
];

export function faseLabel(slug: string | undefined | null): string | null {
  if (!slug) return null;
  return FASE_SLUG_TO_PT[slug] ?? slug;
}

/** Fase de grupos/liga (tabela de pontos) — o resto é eliminatória. */
export function isFaseClassificatoria(slug: string | undefined | null): boolean {
  if (!slug) return true;
  return /group|league|regular|qualif/i.test(slug);
}

type Status = 'agendado' | 'em-andamento' | 'encerrado';

function statusDe(event: any): Status {
  const state: string = event.status?.type?.state ?? 'pre';
  if (event.status?.type?.completed === true || state === 'post') return 'encerrado';
  return state === 'in' ? 'em-andamento' : 'agendado';
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function parseLeg(event: any, nome: (n: string) => string) {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const brt = new Date(new Date(event.date).getTime() - BRT_OFFSET_MS);
  const penM = home?.shootoutScore != null ? Number(home.shootoutScore) : null;
  const penV = away?.shootoutScore != null ? Number(away.shootoutScore) : null;
  return {
    mandante:         nome(home?.team?.displayName ?? ''),
    logoMandante:     home?.team?.logo ?? home?.team?.logos?.[0]?.href ?? null,
    visitante:        nome(away?.team?.displayName ?? ''),
    logoVisitante:    away?.team?.logo ?? away?.team?.logos?.[0]?.href ?? null,
    data:             brt.toISOString().slice(0, 10),
    hora:             brt.toISOString().slice(11, 16),
    placarMandante:   home?.score != null && home.score !== '' ? Number(home.score) : null,
    placarVisitante:  away?.score != null && away.score !== '' ? Number(away.score) : null,
    penaltisMandante: penM,
    penaltisVisitante: penV,
    status:           statusDe(event),
    estadio:          comp?.venue?.fullName ?? '',
  };
}

function teamIds(event: any): string[] {
  return (event.competitions?.[0]?.competitors ?? []).map((c: any) => String(c.team?.id ?? c.id ?? ''));
}

/**
 * Fase em andamento: a do próximo jogo (ou do jogo ao vivo); sem jogos futuros, a do último jogo.
 * Retorna o slug ESPN (ex.: 'semifinals', 'group-stage') ou null sem eventos.
 */
export function faseAtualSlug(events: any[], agora = Date.now()): string | null {
  const ordenados = [...events].filter(e => e?.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (ordenados.length === 0) return null;
  const aoVivo = ordenados.find(e => statusDe(e) === 'em-andamento');
  const proximo = aoVivo ?? ordenados.find(e => statusDe(e) === 'agendado' && Date.parse(e.date) >= agora - BRT_OFFSET_MS);
  const ref = proximo ?? ordenados[ordenados.length - 1];
  return ref.season?.slug ?? null;
}

/**
 * Agrupa os jogos eliminatórios em confrontos (ida/volta ou jogo único) por fase.
 * Os confrontos vêm ordenados com a fase atual primeiro e as fases anteriores em seguida
 * (mais recente → mais antiga); dentro da fase, pela data do primeiro jogo.
 */
export function montarMataMata(events: any[], nome: (n: string) => string = n => n, agora = Date.now()) {
  const vistos = new Set<string>();
  const eliminatorios = events.filter(ev => {
    if (!ev?.id || vistos.has(ev.id)) return false;
    vistos.add(ev.id);
    return !isFaseClassificatoria(ev.season?.slug) && teamIds(ev).length === 2;
  });

  // Chave: fase + par de times (independe de mando e do campo `series`, ausente em jogo único).
  const series = new Map<string, any[]>();
  for (const ev of eliminatorios) {
    const key = `${ev.season?.slug}|${teamIds(ev).sort().join('-')}`;
    if (!series.has(key)) series.set(key, []);
    series.get(key)!.push(ev);
  }

  const confrontos: any[] = [];
  for (const [, legs] of series) {
    legs.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const [ev1, ev2] = legs;
    const comp1 = ev1.competitions?.[0];
    const home1 = comp1?.competitors?.find((c: any) => c.homeAway === 'home');
    const away1 = comp1?.competitors?.find((c: any) => c.homeAway === 'away');
    const time1Id = String(home1?.team?.id ?? '');
    const ida = parseLeg(ev1, nome);
    const volta = ev2 ? parseLeg(ev2, nome) : null;

    let agregadoTime1: number | null = null;
    let agregadoTime2: number | null = null;
    let vencedor: 'time1' | 'time2' | null = null;
    const ladoDe = (teamId: unknown) => String(teamId) === time1Id ? 'time1' as const : 'time2' as const;

    if (volta) {
      // Na volta o mando inverte: o time1 (mandante da ida) é o visitante.
      if (ida.placarMandante !== null && volta.placarVisitante !== null) {
        agregadoTime1 = ida.placarMandante + volta.placarVisitante;
        agregadoTime2 = (ida.placarVisitante ?? 0) + (volta.placarMandante ?? 0);
      }
      if (volta.status === 'encerrado') {
        const comp2 = ev2.competitions?.[0];
        const serieWinner = (comp2?.series?.competitors ?? []).find((c: any) => c.winner);
        const jogoWinner = (comp2?.competitors ?? []).find((c: any) => c.winner);
        if (serieWinner) vencedor = ladoDe(serieWinner.id);
        else if (agregadoTime1 !== null && agregadoTime2 !== null && agregadoTime1 !== agregadoTime2) {
          vencedor = agregadoTime1 > agregadoTime2 ? 'time1' : 'time2';
        } else if (jogoWinner) vencedor = ladoDe(jogoWinner.team?.id);
      }
    } else if (ida.status === 'encerrado') {
      const jogoWinner = (comp1?.competitors ?? []).find((c: any) => c.winner);
      if (jogoWinner) vencedor = ladoDe(jogoWinner.team?.id);
      else if (ida.placarMandante !== null && ida.placarVisitante !== null && ida.placarMandante !== ida.placarVisitante) {
        vencedor = ida.placarMandante > ida.placarVisitante ? 'time1' : 'time2';
      }
    }

    confrontos.push({
      faseSlug: ev1.season?.slug ?? '',
      fase:     faseLabel(ev1.season?.slug) ?? '',
      jogoUnico: !volta,
      time1: { nome: nome(home1?.team?.displayName ?? ''), logo: ida.logoMandante },
      time2: { nome: nome(away1?.team?.displayName ?? ''), logo: ida.logoVisitante },
      ida,
      volta,
      agregadoTime1,
      agregadoTime2,
      vencedor,
    });
  }

  const slugAtual = faseAtualSlug(eliminatorios, agora);
  const ordem = (slug: string) => {
    const i = ORDEM_FASES.indexOf(slug);
    return i === -1 ? -1 : i;
  };
  confrontos.sort((a, b) => {
    if (a.faseSlug !== b.faseSlug) {
      if (a.faseSlug === slugAtual) return -1;
      if (b.faseSlug === slugAtual) return 1;
      return ordem(b.faseSlug) - ordem(a.faseSlug);
    }
    return (a.ida?.data ?? '').localeCompare(b.ida?.data ?? '');
  });

  for (const c of confrontos) delete c.faseSlug;

  return {
    tipo: 'mata-mata' as const,
    faseAtual: faseLabel(slugAtual) ?? '',
    confrontos,
    grupos: [],
  };
}
