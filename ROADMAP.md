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
- [~] Favoritos — apenas times com notificação em `localStorage` (`notif-times`, `app.ts:56`); não há favoritos gerais nem de campeonatos
- [~] Persistência local — existe para notificações; não para favoritos/preferências
- [~] Lembretes via calendário — já existia link do Google Calendar (`buildCalendarUrl`, `app.html` card); falta .ics para Apple/Outlook
- [ ] Página de próximos jogos dos favoritos
- [ ] Preferência de serviços de streaming

## Fase 4 — SEO e crescimento
- [ ] SSR/prerender — sem `@angular/ssr`; SPA (compensado por `/og` no backend e metas dinâmicas)
- [x] Sitemap dinâmico e canonical — v1.3.0: `buildSitemapXml` (`backend/src/sitemap.ts`) inclui home, campeonatos, times e partidas futuras (`/jogo/<slug>`); canonical desde a carga inicial. Evidências: Argus (12 testes backend, paridade de slugs, 20.000 instantes BRT) e produção: 84 URLs únicas, 11 `/jogo/`, paridade 11/11 com os cards, `/ao-vivo` e `/copa-2026` com canonical/og:url próprios
- [~] Dados estruturados — `WebSite` (`index.html:46`) e `SportsEvent` dinâmico (`atualizarSportsEvents`, `app.ts`); falta validar no Rich Results Test
- [ ] Core Web Vitals — não medido
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
- ~~Colisão de slug~~ resolvida na v1.3.0 (sufixo do campeonato); pendente: title/h1 iguais nas páginas colidentes (patch 1.3.1)
- Sitemap lista `/<time>` para documentos incompletos (ex.: `/sem-mandante`) e `/copa-2026` emite JSON-LD da home (patch 1.3.1)
- Cold start do backend: o usuário vê só "Carregando jogos" por muito tempo
- `STREAMING_URLS` e links oficiais ainda sem auditoria de cobertura por plataforma

## Log
- 2026-10-15: Lote B em `feat/descoberta` (busca, filtros data/plataforma, WhatsApp). Build OK; validado em browser headless local. Sem push.
- 2026-10-15: Etapa 0 concluída por Athena. Hephaestus não respondeu (prompts ficam no input do Codex).
- 2026-10-15: Lote A validado em Chrome headless via Puppeteer (extensão Chrome indisponível). Em `feat/ux-basico`: build OK; `ng test` falha igual na `main` (2 testes, `messaging/unsupported-browser` em jsdom) — pré-existente, não relacionado.
- 2026-10-15: Lotes C1 (extração do card, v1.1.2) e C2 (página da partida, v1.2.0) publicados após QA do Argus; fluxo Athena → Hephaestus → Argus operando (1 rodada de correção em cada).
- 2026-10-15: C3 (SEO das partidas, v1.3.0) publicado; primeiro deploy de backend da frente. Sitemap e frontend validados em produção.
