import { Component, input, ViewEncapsulation } from '@angular/core';
import { ConfrontoMataMata } from '../../models/jogo';

@Component({
  selector: 'app-mata-mata-card',
  standalone: true,
  imports: [],
  templateUrl: './mata-mata-card.component.html',
  styleUrl: './mata-mata-card.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MataMataCardComponent {
  confronto = input.required<ConfrontoMataMata>();

  private eHoje(dataIso: string): boolean {
    const brtHoje = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    return dataIso === brtHoje.toISOString().slice(0, 10);
  }

  formatarData(dataIso: string): string {
    if (this.eHoje(dataIso)) return 'Hoje';
    const data = new Date(dataIso + 'T00:00:00');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dias[data.getDay()]}, ${dia}/${mes}`;
  }
}
