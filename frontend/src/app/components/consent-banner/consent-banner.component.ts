import { Component, output, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [],
  templateUrl: './consent-banner.component.html',
  styleUrl: './consent-banner.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ConsentBannerComponent {
  aceitar = output<void>();
  recusar = output<void>();
}
