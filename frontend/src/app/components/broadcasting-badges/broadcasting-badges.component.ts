import { Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-broadcasting-badges',
  standalone: true,
  imports: [],
  templateUrl: './broadcasting-badges.component.html',
  styleUrl: './broadcasting-badges.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class BroadcastingBadgesComponent {
  canal = input.required<string[]>();
  streaming = input.required<string[]>();
  mostrar = input.required<boolean>();

  private readonly STREAMING_URLS: Record<string, string> = {
    'Globoplay':          'https://globoplay.globo.com',
    'Premiere':           'https://globoplay.globo.com',
    'SporTV':             'https://globoplay.globo.com',
    'SporTV 2':           'https://globoplay.globo.com',
    'SporTV 3':           'https://globoplay.globo.com',
    'Cazé TV':            'https://www.youtube.com/cazetv',
    'CazéTV':             'https://www.youtube.com/cazetv',
    'Ge TV':              'https://www.youtube.com/geglobo',
    'Paramount+':         'https://www.paramountplus.com/br',
    'Amazon Prime Video': 'https://www.primevideo.com',
    'Prime Video':        'https://www.primevideo.com',
    'Disney+':            'https://www.disneyplus.com/pt-br',
    'DAZN':               'https://www.dazn.com/pt-BR',
    'TNT Sports':         'https://tntbrasil.com.br',
    'ESPN':               'https://www.espn.com.br',
    'Record':             'https://www.r7.com/ao-vivo',
    'Record TV':          'https://www.r7.com/ao-vivo',
    'SBT':                'https://www.sbt.com.br/ao-vivo',
  };

  getStreamingUrl(plataforma: string): string | null {
    return this.STREAMING_URLS[plataforma] ?? null;
  }
}
