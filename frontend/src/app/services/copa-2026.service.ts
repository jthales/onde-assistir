import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Jogo, Placar, ClassificacaoResponse } from '../models/jogo';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class Copa2026Service {
  constructor(private http: HttpClient) {}

  getClassificacao(): Observable<ClassificacaoResponse> {
    return this.http.get<ClassificacaoResponse>(`${environment.apiUrl}/api/copa-2026/classificacao`);
  }

  getJogos(): Observable<Jogo[]> {
    return this.http.get<Jogo[]>(`${environment.apiUrl}/api/jogos`).pipe(
      map(jogos => jogos.filter(j => j.campeonato === 'Copa do Mundo 2026'))
    );
  }

  getPlacar(): Observable<Placar[]> {
    return this.http.get<Placar[]>(`${environment.apiUrl}/api/placar`);
  }
}
