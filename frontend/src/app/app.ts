import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JogosService } from './services/jogos.service';
import { Jogo } from './models/jogo';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  jogos = signal<Jogo[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  timeSelecionado = signal<string>('');

  times = [
    'Athletico Paranaense', 'Atlético Mineiro', 'Bahia', 'Botafogo',
    'Corinthians', 'Cruzeiro', 'Flamengo', 'Fluminense', 'Fortaleza',
    'Grêmio', 'Internacional', 'Juventude', 'Mirassol', 'Palmeiras',
    'Red Bull Bragantino', 'Santos', 'São Paulo', 'Sport Recife',
    'Vasco', 'Vitória'
  ];

  jogosFiltrados = computed(() => {
    const time = this.timeSelecionado();
    if (!time) return this.jogos();
    return this.jogos().filter(
      j => j.timeMandante === time || j.timeVisitante === time
    );
  });

  constructor(private jogosService: JogosService) {}

  ngOnInit(): void {
    this.jogosService.getJogosDaSemana().subscribe({
      next: (data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
        );
        this.jogos.set(sorted);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Não foi possível carregar os jogos. Tente novamente mais tarde.');
        this.loading.set(false);
      }
    });
  }

  formatarData(dataIso: string): string {
    const data = new Date(dataIso + 'T00:00:00');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaSemana = dias[data.getDay()];
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${diaSemana}, ${dia}/${mes}`;
  }
}
