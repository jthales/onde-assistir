import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Jogo, Odds, Placar } from '../../models/jogo';
import { JogoCardComponent } from './jogo-card.component';

describe('JogoCardComponent', () => {
  let fixture: ComponentFixture<JogoCardComponent>;
  let el: HTMLElement;

  const jogo: Jogo = {
    rodada: 1,
    timeMandante: 'Flamengo',
    timeVisitante: 'Palmeiras',
    data: '2026-10-20',
    hora: '20:00',
    canal: ['SporTV'],
    streaming: ['Disney+', 'Plataforma desconhecida'],
    estadio: 'Maracanã',
    campeonato: 'Brasileirão',
  };
  const textoJogo = 'Flamengo x Palmeiras — Terça, 20/10 às 20:00';
  const whatsappUrl = 'https://wa.me/?text=Flamengo%20x%20Palmeiras';
  const calendarioUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JogoCardComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(JogoCardComponent);
    fixture.componentRef.setInput('jogo', jogo);
    fixture.componentRef.setInput('dataFormatada', 'Terça, 20/10');
    fixture.componentRef.setInput('textoJogo', textoJogo);
    fixture.componentRef.setInput('whatsappUrl', whatsappUrl);
    fixture.componentRef.setInput('calendarioUrl', calendarioUrl);
    fixture.componentRef.setInput('jogoFuturo', true);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('renderiza times, data, horário e identificação acessível do artigo', () => {
    expect(Array.from(el.querySelectorAll('.time-nome'), node => node.textContent?.trim()))
      .toEqual(['Flamengo', 'Palmeiras']);
    expect(el.querySelector('.data')?.textContent).toBe('Terça, 20/10');
    expect(el.querySelector('.hora')?.textContent).toBe('20:00');
    expect(el.querySelector('.jogo-card')?.getAttribute('role')).toBe('article');
    expect(el.querySelector('.jogo-card')?.getAttribute('aria-label')).toBe(textoJogo);
  });

  it('mostra Compartilhar com href wa.me e rótulo acessível', () => {
    const link = el.querySelector('.btn-whatsapp') as HTMLAnchorElement;
    expect(link.textContent).toContain('Compartilhar');
    expect(link.href).toBe(whatsappUrl);
    expect(link.getAttribute('aria-label')).toBe('Compartilhar Flamengo x Palmeiras no WhatsApp');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('mostra AO VIVO quando aoVivo e atualiza o placar recebido', () => {
    const placar: Placar = {
      timeMandante: jogo.timeMandante, timeVisitante: jogo.timeVisitante, data: jogo.data,
      placarMandante: 2, placarVisitante: 1, status: 'em-andamento', tempo: '65', periodo: '2º tempo',
      gols: [{ nome: 'Pedro', time: 'mandante', minuto: '32', penalti: false, contra: false }],
    };
    fixture.componentRef.setInput('aoVivo', true);
    fixture.componentRef.setInput('placar', placar);
    fixture.detectChanges();
    expect(el.querySelector('.ao-vivo-badge')?.textContent).toContain('AO VIVO');
    expect(el.querySelector('.jogo-card--ao-vivo')).toBeTruthy();
    expect(el.querySelector('.placar-numeros')?.textContent).toContain('2 – 1');
    expect(el.querySelector('.gol-item')?.textContent).toContain('Pedro 32');
    expect(el.querySelector('.hora')).toBeNull();
    fixture.componentRef.setInput('placar', { ...placar, placarVisitante: 2 });
    fixture.detectChanges();
    expect(el.querySelector('.placar-numeros')?.textContent).toContain('2 – 2');
  });

  it('preserva links oficiais de TV e streaming e o fallback sem link', () => {
    expect(el.querySelector('.badge-tv--link')?.getAttribute('href')).toBe('https://globoplay.globo.com');
    expect(el.querySelector('.badge-streaming--link')?.getAttribute('href')).toBe('https://www.disneyplus.com/pt-br');
    expect(el.querySelector('span.badge-streaming')?.textContent).toContain('Plataforma desconhecida');
  });

  it('emite o campeonato sem propagar o clique e emite o jogo ao alternar notificações', () => {
    const campeonato = vi.fn();
    const notificacao = vi.fn();
    const clickNoHost = vi.fn();
    fixture.componentInstance.navegarParaCampeonato.subscribe(campeonato);
    fixture.componentInstance.toggleNotificacaoJogo.subscribe(notificacao);
    el.addEventListener('click', clickNoHost);
    (el.querySelector('.campeonato-badge--btn') as HTMLButtonElement).click();
    expect(campeonato).toHaveBeenCalledWith('Brasileirão');
    expect(clickNoHost).not.toHaveBeenCalled();
    (el.querySelector('.btn-notif-jogo') as HTMLButtonElement).click();
    expect(notificacao).toHaveBeenCalledWith(jogo);
  });

  it('atualiza a notificação ativa e preserva o link de calendário', () => {
    fixture.componentRef.setInput('notificacaoAtiva', true);
    fixture.detectChanges();
    const botao = el.querySelector('.btn-notif-jogo') as HTMLButtonElement;
    expect(botao.classList.contains('ativo')).toBe(true);
    expect(botao.title).toBe('Desativar notificações de gol');
    expect(botao.textContent).toContain('Notificações ativas');
    expect(el.querySelector('.btn-agendar')?.getAttribute('href')).toBe(calendarioUrl);
    fixture.componentRef.setInput('jogoFuturo', false);
    fixture.detectChanges();
    expect(el.querySelector('.btn-agendar')).toBeNull();
  });

  it('oculta calendário, notificação e odds ao encerrar e mantém Compartilhar', () => {
    const odds: Odds = {
      timeMandante: jogo.timeMandante, timeVisitante: jogo.timeVisitante, data: jogo.data,
      provedor: 'Odds', mandante: 1.5, empate: 2.5, visitante: 3.5,
    };
    fixture.componentRef.setInput('odds', odds);
    fixture.detectChanges();
    expect(el.querySelectorAll('.odds-item').length).toBe(3);
    fixture.componentRef.setInput('encerrado', true);
    fixture.detectChanges();
    expect(el.querySelector('.encerrado-badge')?.textContent).toBe('Encerrado');
    expect(el.querySelector('.btn-notif-jogo')).toBeNull();
    expect(el.querySelector('.btn-agendar')).toBeNull();
    expect(el.querySelector('.odds-row')).toBeNull();
    expect(el.querySelector('.btn-whatsapp')).toBeTruthy();
  });

  it('preserva A definir e A confirmar conforme os dados de transmissão', () => {
    fixture.componentRef.setInput('jogo', { ...jogo, canal: [], streaming: [] });
    fixture.componentRef.setInput('mostrarOndeAssistir', false);
    fixture.detectChanges();
    expect(el.querySelector('.badge-confirmar')?.textContent).toBe('A definir');
    fixture.componentRef.setInput('mostrarOndeAssistir', true);
    fixture.detectChanges();
    expect(el.querySelector('.badge-confirmar')?.textContent).toBe('A confirmar');
  });

  it('oferece Ver detalhes com slug e nome acessível do confronto', () => {
    const link = el.querySelector('.btn-detalhes') as HTMLAnchorElement;
    expect(link.textContent).toContain('Ver detalhes');
    expect(link.getAttribute('href')).toBe('/jogo/flamengo-x-palmeiras-2026-10-20');
    expect(link.getAttribute('aria-label')).toBe('Ver detalhes de Flamengo x Palmeiras');
  });

  it('no modo de detalhes mantém calendário para jogo encerrado e oculta o link para si próprio', () => {
    fixture.componentRef.setInput('modoDetalhes', true);
    fixture.componentRef.setInput('encerrado', true);
    fixture.componentRef.setInput('jogoFuturo', false);
    fixture.detectChanges();
    expect(el.querySelector('.btn-detalhes')).toBeNull();
    expect(el.querySelector('.btn-agendar')?.getAttribute('href')).toBe(calendarioUrl);
    expect(el.querySelector('.btn-notif-jogo')).toBeNull();
  });
});
