import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Jogo } from '../models/jogo';

@Injectable({
  providedIn: 'root'
})
export class JogosService {
  private readonly apiUrl = 'http://localhost:3000/api/jogos';

  constructor(private http: HttpClient) {}

  getJogosDaSemana(): Observable<Jogo[]> {
    return this.http.get<Jogo[]>(this.apiUrl);
  }
}
