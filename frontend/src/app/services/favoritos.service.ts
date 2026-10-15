import { computed, Injectable, signal, WritableSignal } from '@angular/core';
import { lerListaLocal } from './local-storage';

@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private readonly timesState = signal(lerListaLocal('favoritos-times'));
  private readonly campeonatosState = signal(lerListaLocal('favoritos-campeonatos'));
  readonly times = this.timesState.asReadonly();
  readonly campeonatos = this.campeonatosState.asReadonly();
  readonly total = computed(() => this.times().length + this.campeonatos().length);
  readonly temFavoritos = computed(() => this.total() > 0);

  eTimeFavorito(nome: string): boolean { return this.times().includes(nome); }
  eCampeonatoFavorito(slug: string): boolean { return this.campeonatos().includes(slug); }

  toggleTime(nome: string): void { this.alternar(this.timesState, 'favoritos-times', nome); }
  toggleCampeonato(slug: string): void { this.alternar(this.campeonatosState, 'favoritos-campeonatos', slug); }

  private alternar(estado: WritableSignal<string[]>, chave: string, valor: string): void {
    valor = valor.trim();
    if (!valor) return;
    const proximo = estado().includes(valor) ? estado().filter(item => item !== valor) : [...estado(), valor];
    estado.set(proximo);
    try { localStorage.setItem(chave, JSON.stringify(proximo)); } catch {}
  }
}
