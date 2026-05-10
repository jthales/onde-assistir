import { Component, input, output, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-hero-header',
  standalone: true,
  imports: [],
  templateUrl: './hero-header.component.html',
  styleUrl: './hero-header.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class HeroHeaderComponent {
  campeonatoSlug = input<string>('');
  campeonatoLabel = input<string>('');
  timeSelecionado = input<string>('');
  voltar = output<void>();
}
