import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Jogo } from '../models/jogo';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class JogosService {
  private readonly apiUrl = `${environment.apiUrl}/api/jogos`;

  constructor(private http: HttpClient) {}

  getJogosDaSemana(): Observable<Jogo[]> {
    return this.http.get<Jogo[]>(this.apiUrl);
  }
}
