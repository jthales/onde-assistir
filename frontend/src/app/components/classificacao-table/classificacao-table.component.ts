import { Component, input, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassificacaoEntry } from '../../models/jogo';

@Component({
  selector: 'app-classificacao-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './classificacao-table.component.html',
  styleUrl: './classificacao-table.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ClassificacaoTableComponent {
  titulo = input<string>('');
  times = input.required<ClassificacaoEntry[]>();
  variant = input<'full' | 'grupo' | 'compact'>('compact');
  timeSelecionado = input<string>('');
  mostrarBadgeLive = input<boolean>(false);

  asideClass = computed(() => {
    const v = this.variant();
    if (v === 'full') return 'classificacao classificacao--destaque';
    if (v === 'grupo') return 'classificacao classificacao--grupo';
    return 'classificacao';
  });

  tableClass = computed(() => {
    const v = this.variant();
    if (v === 'full') return 'classificacao-tabela classificacao-tabela--full';
    if (v === 'grupo') return 'classificacao-tabela classificacao-tabela--grupo';
    return 'classificacao-tabela';
  });
}
