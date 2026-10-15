import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-favorito-button',
  standalone: true,
  templateUrl: './favorito-button.component.html',
  styleUrl: './favorito-button.component.scss',
})
export class FavoritoButtonComponent {
  readonly nome = input.required<string>();
  readonly ativo = input(false);
  readonly alternar = output<void>();
}
