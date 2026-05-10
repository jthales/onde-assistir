import { Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ToastComponent {
  mensagem = input.required<string>();
  tipo = input.required<'gol' | 'notif'>();
}
