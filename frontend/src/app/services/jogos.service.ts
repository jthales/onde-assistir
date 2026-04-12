import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Jogo, Placar, Odds, ClassificacaoEntry, Noticia, ClassificacaoResponse, JogoCampeonato } from '../models/jogo';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class JogosService {
  constructor(private http: HttpClient) {}

  getJogosDaSemana(): Observable<Jogo[]> {
    return this.http.get<Jogo[]>(`${environment.apiUrl}/api/jogos`);
  }

  getPlacar(): Observable<Placar[]> {
    return this.http.get<Placar[]>(`${environment.apiUrl}/api/placar`);
  }

  getOdds(): Observable<Odds[]> {
    return this.http.get<Odds[]>(`${environment.apiUrl}/api/odds`);
  }

  getClassificacao(): Observable<ClassificacaoEntry[]> {
    return this.http.get<ClassificacaoEntry[]>(`${environment.apiUrl}/api/classificacao`);
  }

  getNoticias(timeSlug: string): Observable<Noticia[]> {
    return this.http.get<Noticia[]>(`${environment.apiUrl}/api/noticias/${timeSlug}`);
  }

  getClassificacaoCampeonato(liga: string): Observable<ClassificacaoResponse> {
    return this.http.get<ClassificacaoResponse>(`${environment.apiUrl}/api/classificacao/${liga}`);
  }

  getJogosCampeonato(liga: string): Observable<JogoCampeonato[]> {
    return this.http.get<JogoCampeonato[]>(`${environment.apiUrl}/api/jogos-campeonato/${liga}`);
  }

  getNoticiasCampeonato(liga: string): Observable<Noticia[]> {
    return this.http.get<Noticia[]>(`${environment.apiUrl}/api/noticias-campeonato/${liga}`);
  }
}
