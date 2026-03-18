import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Jogo, Placar, Odds } from '../models/jogo';
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
}
