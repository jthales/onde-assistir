import { Component, input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Odds } from '../../models/jogo';

@Component({
  selector: 'app-odds-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './odds-row.component.html',
  styleUrl: './odds-row.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class OddsRowComponent {
  odds = input.required<Odds>();
  timeMandante = input.required<string>();
  timeVisitante = input.required<string>();
}
