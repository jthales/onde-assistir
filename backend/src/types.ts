export interface Jogo {
  rodada: number;
  timeMandante: string;
  timeVisitante: string;
  data: string; // ISO 8601
  hora: string;
  canal: string[];
  streaming: string[];
  estadio: string;
}
