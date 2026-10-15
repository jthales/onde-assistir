import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Jogo, Odds, Placar } from '../../models/jogo';
import { teamInitials } from '../../team-logos';
import { translateCountry } from '../../copa-2026/country-names';
import { buildJogoUrl } from '../../jogo-url';

@Component({
  selector: 'app-jogo-card',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './jogo-card.component.html',
  styleUrl: './jogo-card.component.scss',
})
export class JogoCardComponent {
  readonly jogo = input.required<Jogo>();
  readonly aoVivo = input(false);
  readonly encerrado = input(false);
  readonly hoje = input(false);
  readonly dataFormatada = input.required<string>();
  readonly textoJogo = input.required<string>();
  readonly placar = input<Placar>();
  readonly odds = input<Odds>();
  readonly mostrarOndeAssistir = input(true);
  readonly jogoFuturo = input(false);
  readonly notificacaoAtiva = input(false);
  readonly whatsappUrl = input.required<string>();
  readonly calendarioUrl = input('');
  readonly modoDetalhes = input(false);
  readonly detalhesUrl = computed(() => buildJogoUrl(this.jogo()));

  readonly navegarParaCampeonato = output<string>();
  readonly toggleNotificacaoJogo = output<Jogo>();

  readonly getInitials = teamInitials;
  readonly translateCountry = translateCountry;

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
