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
