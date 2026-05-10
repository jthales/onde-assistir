import { Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-pull-to-refresh',
  standalone: true,
  imports: [],
  templateUrl: './pull-to-refresh.component.html',
  styleUrl: './pull-to-refresh.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class PullToRefreshComponent {
  pullDistance = input.required<number>();
  isRefreshing = input.required<boolean>();
}
