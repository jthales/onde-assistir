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

export interface Noticia {
  titulo: string;
  descricao: string;
  imagem: string;
  link: string;
  publicadoEm: string;
}

export interface ClassificacaoEntry {
  posicao: number;
  posicaoAnterior?: number;
  nome: string;
  logo: string | null;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  gols: number;
  golsSofridos: number;
  saldo: number;
  pontos: number;
  provisorio?: boolean;
}

export interface JogoCampeonato {
  timeMandante: string;
  timeVisitante: string;
  logoMandante: string | null;
  logoVisitante: string | null;
  data: string;
  hora: string;
  status: 'agendado' | 'em-andamento' | 'encerrado';
  placarMandante: number | null;
  placarVisitante: number | null;
  estadio: string;
  campeonato: string;
}

export interface GrupoClassificacao {
  nome: string;
  times: ClassificacaoEntry[];
}

export interface ClassificacaoResponse {
  tipo: 'tabela-unica' | 'grupos';
  grupos: GrupoClassificacao[];
}
