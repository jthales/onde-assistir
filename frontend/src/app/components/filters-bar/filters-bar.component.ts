import { Component, input, output, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [],
  templateUrl: './filters-bar.component.html',
  styleUrl: './filters-bar.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FiltersBarComponent {
  temJogoAoVivo = input<boolean>(false);
  filtroAoVivo = input<boolean>(false);
  timeSelecionado = input<string>('');
  notifAtivaParaTimeAtual = input<boolean>(false);
  tituloBotaoNotificacao = input<string>('');
  textoBotaoNotificacao = input<string>('');
  aoVivoClick = output<void>();
  notifClick = output<void>();
}
