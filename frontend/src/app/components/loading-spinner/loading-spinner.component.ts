import { Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class LoadingSpinnerComponent {
  texto = input.required<string>();
}
