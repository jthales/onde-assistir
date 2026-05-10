import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { Jogo, Placar, Odds } from '../../models/jogo';
import { teamInitials } from '../../team-logos';
import { GoalsSectionComponent } from '../goals-section/goals-section.component';
import { BroadcastingBadgesComponent } from '../broadcasting-badges/broadcasting-badges.component';
import { OddsRowComponent } from '../odds-row/odds-row.component';

@Component({
  selector: 'app-jogo-card',
  standalone: true,
  imports: [GoalsSectionComponent, BroadcastingBadgesComponent, OddsRowComponent],
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
