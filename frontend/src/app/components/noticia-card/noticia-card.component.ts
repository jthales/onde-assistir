import { Component, input, ViewEncapsulation } from '@angular/core';
import { Noticia } from '../../models/jogo';

@Component({
  selector: 'app-noticia-card',
  standalone: true,
  imports: [],
  templateUrl: './noticia-card.component.html',
  styleUrl: './noticia-card.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class NoticiaCardComponent {
  noticia = input.required<Noticia>();
}
