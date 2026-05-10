import { Component, output, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [],
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class UpdateBannerComponent {
  atualizar = output<void>();
}
