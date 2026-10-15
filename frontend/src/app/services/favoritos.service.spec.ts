import { TestBed } from '@angular/core/testing';
import { FavoritosService } from './favoritos.service';

describe('FavoritosService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('é injetável e começa vazio sem dados locais', () => {
    const service = TestBed.inject(FavoritosService);
    expect(service.times()).toEqual([]);
    expect(service.campeonatos()).toEqual([]);
    expect(service.temFavoritos()).toBe(false);
    expect(service.total()).toBe(0);
  });

  it('lê listas válidas, remove duplicatas e calcula o contador', () => {
    localStorage.setItem('favoritos-times', '["Flamengo","Flamengo","Palmeiras"]');
    localStorage.setItem('favoritos-campeonatos', '["libertadores"]');
    const service = new FavoritosService();
    expect(service.times()).toEqual(['Flamengo', 'Palmeiras']);
    expect(service.campeonatos()).toEqual(['libertadores']);
    expect(service.total()).toBe(3);
  });

  it('alterna o time e persiste inclusão e remoção na chave própria', () => {
    const service = new FavoritosService();
    service.toggleTime('Flamengo');
    expect(service.eTimeFavorito('Flamengo')).toBe(true);
    expect(localStorage.getItem('favoritos-times')).toBe('["Flamengo"]');
    service.toggleTime('Flamengo');
    expect(service.eTimeFavorito('Flamengo')).toBe(false);
    expect(localStorage.getItem('favoritos-times')).toBe('[]');
  });

  it('alterna o campeonato e persiste em chave separada', () => {
    const service = new FavoritosService();
    service.toggleCampeonato('libertadores');
    expect(service.eCampeonatoFavorito('libertadores')).toBe(true);
    expect(localStorage.getItem('favoritos-campeonatos')).toBe('["libertadores"]');
    service.toggleCampeonato('libertadores');
    expect(service.campeonatos()).toEqual([]);
    expect(localStorage.getItem('favoritos-campeonatos')).toBe('[]');
  });

  it('restaura favoritos em uma nova instância, como ao recarregar a página', () => {
    const service = new FavoritosService();
    service.toggleTime('São Paulo');
    service.toggleCampeonato('brasileirao');
    const recarregado = new FavoritosService();
    expect(recarregado.times()).toEqual(['São Paulo']);
    expect(recarregado.campeonatos()).toEqual(['brasileirao']);
  });

  it('trata JSON inválido e valores que não sejam listas válidas como listas vazias', () => {
    for (const valor of ['{invalido', 'null', '{}', '42', '["Flamengo",1]', '[null]', '[""]', '["  "]']) {
      localStorage.setItem('favoritos-times', valor);
      localStorage.setItem('favoritos-campeonatos', valor);
      const service = new FavoritosService();
      expect(service.times()).toEqual([]);
      expect(service.campeonatos()).toEqual([]);
    }
  });

  it('tolera erro de leitura do storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const service = new FavoritosService();
    expect(service.times()).toEqual([]);
    expect(service.campeonatos()).toEqual([]);
  });

  it('tolera o próprio localStorage indisponível e mantém favoritos em memória', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    const service = new FavoritosService();
    expect(() => service.toggleTime('Flamengo')).not.toThrow();
    expect(() => service.toggleCampeonato('brasileirao')).not.toThrow();
    expect(service.total()).toBe(2);
  });

  it('tolera falha de escrita e permite remover o favorito em memória', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const service = new FavoritosService();
    service.toggleTime('Flamengo');
    expect(service.eTimeFavorito('Flamengo')).toBe(true);
    service.toggleTime('Flamengo');
    expect(service.times()).toEqual([]);
  });

  it('ignora valores vazios no toggle', () => {
    const service = new FavoritosService();
    const escrita = vi.spyOn(Storage.prototype, 'setItem');
    service.toggleTime(' ');
    service.toggleCampeonato('');
    expect(service.total()).toBe(0);
    expect(escrita).not.toHaveBeenCalled();
  });

  it('não lê nem altera preferências de notificação como favoritos', () => {
    localStorage.setItem('notif-times', '["Flamengo"]');
    localStorage.setItem('notif-jogos', '["jogo-id"]');
    const service = new FavoritosService();
    expect(service.total()).toBe(0);
    service.toggleTime('Palmeiras');
    service.toggleCampeonato('brasileirao');
    expect(localStorage.getItem('notif-times')).toBe('["Flamengo"]');
    expect(localStorage.getItem('notif-jogos')).toBe('["jogo-id"]');
  });
});
