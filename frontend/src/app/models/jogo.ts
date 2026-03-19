export interface Gol {
  nome: string;
  time: 'mandante' | 'visitante';
  minuto: string;
  penalti: boolean;
  contra: boolean;
}

export interface Placar {
  timeMandante: string;
  timeVisitante: string;
  data: string;
  placarMandante: number | null;
  placarVisitante: number | null;
  status: 'em-andamento' | 'encerrado' | 'agendado';
  tempo?: string;
  periodo?: string;
  gols: Gol[];
}

export interface Odds {
  timeMandante: string;
  timeVisitante: string;
  data: string;
  provedor: string | null;
  mandante: number | null;
  empate: number | null;
  visitante: number | null;
}

export interface Jogo {
  rodada: number;
  timeMandante: string;
  timeVisitante: string;
  logoMandante?: string;
  logoVisitante?: string;
  data: string; // ISO 8601
  hora: string;
  canal: string[];
  streaming: string[];
  estadio: string;
  campeonato?: string;
}
