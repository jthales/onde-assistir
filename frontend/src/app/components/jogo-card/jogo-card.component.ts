import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Jogo, Placar, Odds } from '../../models/jogo';
import { teamInitials } from '../../team-logos';

@Component({
  selector: 'app-jogo-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './jogo-card.component.html',
  styleUrl: './jogo-card.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class JogoCardComponent {
  jogo = input.required<Jogo>();
  placar = input<Placar | undefined>(undefined);
  odds = input<Odds | undefined>(undefined);
  notifAtiva = input<boolean>(false);

  campeonatoClick = output<string>();
  toggleNotif = output<void>();

  getInitials = teamInitials;

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

  eAoVivo(): boolean {
    const p = this.placar();
    if (p) return p.status === 'em-andamento';
    const j = this.jogo();
    if (!j.hora || j.hora === '00:00') return false;
    const inicio = new Date(`${j.data}T${j.hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
    const agora = new Date();
    return agora >= inicio && agora < fim;
  }

  eEncerrado(): boolean {
    return this.placar()?.status === 'encerrado';
  }

  eJogoFuturo(): boolean {
    const j = this.jogo();
    if (!j.hora || j.hora === '00:00') return true;
    return new Date() < new Date(`${j.data}T${j.hora}:00-03:00`);
  }

  mostrarOndeAssistir(): boolean {
    const brtHoje = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    const limite = new Date(brtHoje);
    limite.setDate(limite.getDate() + 3);
    return this.jogo().data <= limite.toISOString().slice(0, 10);
  }

  eHoje(dataIso: string): boolean {
    const brtHoje = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    return dataIso === brtHoje.toISOString().slice(0, 10);
  }

  formatarData(dataIso: string): string {
    if (this.eHoje(dataIso)) return 'Hoje';
    const data = new Date(dataIso + 'T00:00:00');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dias[data.getDay()]}, ${dia}/${mes}`;
  }

  h3Texto(): string {
    const j = this.jogo();
    const data = this.formatarData(j.data);
    const hora = j.hora && j.hora !== '00:00' ? ` às ${j.hora}` : '';
    return `${j.timeMandante} x ${j.timeVisitante} — ${data}${hora}`;
  }

  getStreamingUrl(plataforma: string): string | null {
    return this.STREAMING_URLS[plataforma] ?? null;
  }

  buildCalendarUrl(): string {
    const j = this.jogo();
    const titulo = `${j.timeMandante} x ${j.timeVisitante}`;
    const camp = j.campeonato ? ` — ${j.campeonato}` : '';
    const text = encodeURIComponent(titulo + camp);
    const hora = j.hora && j.hora !== '00:00' ? j.hora : '12:00';
    const inicio = new Date(`${j.data}T${hora}:00-03:00`);
    const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const canais = [...j.canal, ...j.streaming].join(', ') || 'A confirmar';
    const details = encodeURIComponent(`Onde assistir: ${canais}`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${text}&dates=${fmt(inicio)}/${fmt(fim)}&details=${details}`;
  }
}
