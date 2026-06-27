import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Jogo, Placar, ClassificacaoResponse } from '../models/jogo';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class Copa2026Service {
  constructor(private http: HttpClient) {}

  getClassificacao(): Observable<ClassificacaoResponse> {
    return this.http.get<ClassificacaoResponse>(`${environment.apiUrl}/api/copa-2026/classificacao`);
  }

  getGruposClassificacao(): Observable<ClassificacaoResponse> {
    return this.http.get<ClassificacaoResponse>(`${environment.apiUrl}/api/copa-2026/classificacao?forceGrupos=true`);
  }

  getJogos(): Observable<Jogo[]> {
    return this.http.get<Jogo[]>(`${environment.apiUrl}/api/copa-2026/jogos`);
  }

  getPlacar(): Observable<Placar[]> {
    return this.http.get<Placar[]>(`${environment.apiUrl}/api/placar`);
  }
}
