export interface Placar {
  timeMandante: string;
  timeVisitante: string;
  data: string;
  placarMandante: number | null;
  placarVisitante: number | null;
  status: 'em-andamento' | 'encerrado' | 'agendado';
  tempo?: string;
  periodo?: string;
}

export interface Odds {
  timeMandante: string;
  timeVisitante: string;
  data: string;
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
