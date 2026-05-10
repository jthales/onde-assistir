import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { ClassificacaoEntry } from '../../models/jogo';
import { teamInitials } from '../../team-logos';

@Component({
  selector: 'app-team-picker',
  standalone: true,
  imports: [],
  templateUrl: './team-picker.component.html',
  styleUrl: './team-picker.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class TeamPickerComponent {
  times = input.required<ClassificacaoEntry[]>();
  timeSelecionado = input<string>('');
  timesComJogo = input<Set<string>>(new Set());
  timesComNotificacao = input<string[]>([]);
  timeSelected = output<string>();
  getInitials = teamInitials;
}
