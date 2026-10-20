# ROADMAP — Onde Assistir

Estado real auditado em 2026-10-15 (Etapa 0). Legenda: `[x]` concluída e validada · `[~]` parcial · `[ ]` pendente · `[!]` bloqueada.
Auditoria feita por leitura de código + checagem em produção. Itens "(sem validação visual)" não foram abertos em browser.

## Fase 1 — Estabilização e experiência básica
- [x] APIs em produção carregam — `/api/jogos` (11 jogos), `/api/placar`, `/api/copa-2026/jogos` retornam 200 (checado 2026-10-15)
- [x] Loading / erro / sem jogos — `role=status`/`role=alert` + "Tentar novamente". Validado em Chrome headless (API bloqueada → alerta+botão; após retry 11 cards)
- [~] Hoje / amanhã / próximos dias — validado em browser: Hoje, Amanhã, Sábado 17/10…; falta agrupamento/abas por dia
- [~] Horários America/Sao_Paulo — Lote A: `eHoje`/`dataBrt` usam `Intl` com `America/Sao_Paulo`; restam offsets `-03:00` fixos em `app.ts` (comparações de início de jogo)
- [~] Responsividade e acessibilidade — Lote A: zoom liberado, `aria-pressed` em todos os chips/filtros, `role=article`+`aria-label` em 11/11 cards (validado em Chrome headless 390px, sem scroll horizontal). Pendente: contraste, foco por teclado, leitor de tela

## Fase 2 — Descoberta e navegação
- [x] Filtros — time (chips), ao vivo, Brasil, campeonato, e (Lote B) data e canal/plataforma (`datasDisponiveis`, `plataformasDisponiveis`, `jogosFiltrados` em `app.ts`). Validado em Chrome headless: data→1 card, Disney+→1 card, todos com o canal
- [x] Busca por time/competição — `busca` (sem acento/caixa) em `jogosFiltrados`; validado: "flamengo"→2 jogos, "zzzz"→estado vazio, limpar→11
- [x] Página individual da partida — `/jogo/:slug` (v1.2.0, `jogo-url.ts`, `app.ts`, `JogoCardComponent` em modo detalhes). Evidências: QA do Argus em desktop/tablet/mobile (44→47 testes), e smoke em produção: h1 único, canonical e `SportsEvent` próprios, 404 amigável, WhatsApp com permalink e data absoluta. Limites: SEO por JS (sem SSR), partidas fora de `/api/jogos` não são encontradas, colisão de slug possível
- [~] Links oficiais de streaming — `getStreamingUrl` + `STREAMING_URLS` (`app.ts:805`); cobertura por plataforma não auditada
- [x] Compartilhamento WhatsApp — `buildWhatsappUrl` + botão no card; validado: `wa.me/?text=` com jogo, horário, canais e link

## Fase 3 — Personalização
- [x] Favoritos de times e campeonatos — v1.4.0: `FavoritosService` (`favoritos-times`/`favoritos-campeonatos`), estrela com `aria-pressed` (112×44), chips com favoritos primeiro, `/favoritos`. Evidências: QA do Argus (89 testes, delta 0 de layout contra produção, storage hostil) e smoke em produção em 3 viewports
- [x] Persistência local sem cadastro — `localStorage` com leitura protegida e fallback em memória; validado com storage bloqueado, JSON inválido e tipos errados (0 erros de JS, 11 cards)
- [~] Lembretes via calendário — já existia link do Google Calendar (`buildCalendarUrl`, `app.html` card); falta .ics para Apple/Outlook
- [x] Página de próximos jogos dos favoritos — `/favoritos` (jogos futuros de time ou campeonato favorito, SEO próprio, estado vazio, JSON-LD); validada em produção
- [ ] Preferência de serviços de streaming

## Fase 4 — SEO e crescimento
- [ ] SSR/prerender — sem `@angular/ssr`; SPA (compensado por `/og` no backend e metas dinâmicas)
- [x] Sitemap dinâmico e canonical — v1.3.0: `buildSitemapXml` (`backend/src/sitemap.ts`) inclui home, campeonatos, times e partidas futuras (`/jogo/<slug>`); canonical desde a carga inicial. Evidências: Argus (12 testes backend, paridade de slugs, 20.000 instantes BRT) e produção: 84 URLs únicas, 11 `/jogo/`, paridade 11/11 com os cards, `/ao-vivo` e `/copa-2026` com canonical/og:url próprios
- [~] Dados estruturados — `WebSite` (`index.html:46`) e `SportsEvent` dinâmico (`atualizarSportsEvents`, `app.ts`); falta validar no Rich Results Test
- [~] Core Web Vitals — v1.4.1 (E1): CLS home 0,21→0,00, /jogo 0,16→0,005, /campeonato 0,26→0,016 e bytes de imagem −80/−86% (logos via combiner da ESPN + width/height + lazy + reserva de layout). Validado em produção (Argus, mobile 3G/CPU 4×). Pendente: INP de /favoritos mobile 320 ms (Ruim), TBT 200–350 ms (bundle + AdSense), cold start do backend (~1,5 s MISS), App só no cliente (FCP ~1,65 s mobile frio)
- [~] Monitoramento — `@vercel/analytics` com eventos (`app.ts:26,544,587`); sem monitor de erros (Sentry/Datadog)

## Fase 5 — Diferenciais
- [~] Agenda semanal por competição — `/campeonato/:slug` + `/api/jogos-campeonato/:liga`; sem visão semanal dedicada
- [ ] Histórico de transmissões por time
- [~] Notificações — push FCM (`/api/subscricao`, `firebase-messaging-sw.js`, `push-notificacao.service.ts`); alertas de mudança de horário/transmissão não existem (sem validação ponta a ponta)
- [x] PWA instalável — `manifest.json` + `ngsw-config.json` + `provideServiceWorker` (sem validação visual no celular)
- [ ] Painel administrativo — só `POST /api/admin/invalidar-cache`

## Problemas críticos / dívida
- `app.ts` com 1103 linhas e `app.html` com 844: tudo num componente; bloqueia páginas por partida e testes
- Testes: só `app.spec.ts` (698 B); backend sem testes (`npm test` é placeholder)
- ESPN rejeitou `dates=A-B` em 2026-10 → corrigido por `fetchEspn` (commit `c80ce3c`); dependência de API não oficial segue frágil
- `environment.ts` aponta para produção em dev local

## Dívida técnica registrada (pós-C2)
- ~~Colisão de slug~~ resolvida na v1.3.0 (sufixo do campeonato) e título/h1 com campeonato na v1.3.1
- Ao abrir `/copa-2026` a frio e clicar em Voltar, URL e meta voltam à home mas o h1 do hero permanece "Copa do Mundo 2026" (pré-existente)
- Cold start do backend: 1ª requisição com cache de borda expirado ~1,5 s (MISS) e usuário vê só "Carregando jogos"; /api/odds até 1,6 s empurra o card (decisão pendente: keep-warm/SWR, AdSense após load, placeholder de odds, preload do fetch)
- `STREAMING_URLS` e links oficiais ainda sem auditoria de cobertura por plataforma

- "Ver ao vivo" com 30px de altura (< 44px de alvo de toque)
- Acesso a "Meus favoritos" ausente em `/campeonato/*`, `/jogo/*` e `/copa-2026`; `/campeonato/*` emite JSON-LD com os eventos da home
- Favoritos só no navegador (sem sincronização entre dispositivos)

## Log
- 2026-10-15: Lote B em `feat/descoberta` (busca, filtros data/plataforma, WhatsApp). Build OK; validado em browser headless local. Sem push.
- 2026-10-15: Etapa 0 concluída por Athena. Hephaestus não respondeu (prompts ficam no input do Codex).
- 2026-10-15: Lote A validado em Chrome headless via Puppeteer (extensão Chrome indisponível). Em `feat/ux-basico`: build OK; `ng test` falha igual na `main` (2 testes, `messaging/unsupported-browser` em jsdom) — pré-existente, não relacionado.
- 2026-10-15: Lotes C1 (extração do card, v1.1.2) e C2 (página da partida, v1.2.0) publicados após QA do Argus; fluxo Athena → Hephaestus → Argus operando (1 rodada de correção em cada).
- 2026-10-15: C3 (SEO das partidas, v1.3.0) publicado; primeiro deploy de backend da frente. Sitemap e frontend validados em produção.
- 2026-10-15: patch 1.3.1 publicado (título com campeonato nas colisões, sitemap sem documentos incompletos, /copa-2026 sem SportsEvent doméstico); aprovado pelo Argus (63 testes front, 13 back).
- 2026-10-15: Lote D1 (favoritos, v1.4.0) publicado após QA do Argus com 1 rodada de correção (delta de 44px eliminado, favoritos válidos preservados, estrela estável).
- 2026-10-15: baseline de Core Web Vitals (Argus, 80 execuções) e lote E1 (v1.4.1, performance de imagens e CLS) publicado após QA com 1 rodada de correção (min-height 100svh removido, fallback de logo); smoke em produção aprovado.
- 2026-10-20: Champions League (v1.5.0) implementada em `feat/champions-league` (ESPN `uefa.champions`, slug `champions-league`); build e testes OK localmente, aguardando QA e aprovação. Não publicada.
