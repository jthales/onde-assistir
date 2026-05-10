import { Component, input, ViewEncapsulation } from '@angular/core';
import { Gol } from '../../models/jogo';

@Component({
  selector: 'app-goals-section',
  standalone: true,
  imports: [],
  templateUrl: './goals-section.component.html',
  styleUrl: './goals-section.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class GoalsSectionComponent {
  gols = input.required<Gol[]>();
}
