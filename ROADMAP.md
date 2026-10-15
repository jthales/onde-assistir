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
- [~] Filtros — por time (chips), ao vivo, "jogos do Brasil", campeonato (`/campeonato/:slug`); faltam data e plataforma
- [ ] Busca por time/competição
- [ ] Página individual da partida (rotas só por time/campeonato, via `history.replaceState`, sem Angular Router)
- [~] Links oficiais de streaming — `getStreamingUrl` + `STREAMING_URLS` (`app.ts:805`); cobertura por plataforma não auditada
- [ ] Compartilhamento WhatsApp

## Fase 3 — Personalização
- [~] Favoritos — apenas times com notificação em `localStorage` (`notif-times`, `app.ts:56`); não há favoritos gerais nem de campeonatos
- [~] Persistência local — existe para notificações; não para favoritos/preferências
- [ ] Lembretes via calendário (.ics)
- [ ] Página de próximos jogos dos favoritos
- [ ] Preferência de serviços de streaming

## Fase 4 — SEO e crescimento
- [ ] SSR/prerender — sem `@angular/ssr`; SPA (compensado por `/og` no backend e metas dinâmicas)
- [x] Sitemap dinâmico e canonical — sitemap (`backend/src/index.ts:960`) e `setCanonical` em `app.ts` (Lote A: canonical agora definido já na carga inicial; antes só após navegação — validado: `https://ondeassistir.space/`)
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

## Log
- 2026-10-15: Etapa 0 concluída por Athena. Hephaestus não respondeu (prompts ficam no input do Codex).
- 2026-10-15: Lote A validado em Chrome headless via Puppeteer (extensão Chrome indisponível). Em `feat/ux-basico`: build OK; `ng test` falha igual na `main` (2 testes, `messaging/unsupported-browser` em jsdom) — pré-existente, não relacionado.
