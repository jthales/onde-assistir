# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.6.0] — 2026-10-20

### Adicionado

- Sitemap só com páginas de time que a SPA resolve (tabela do Brasileirão), com `/campeonato/copa-do-brasil`, `/copa-2026` e `/ao-vivo`; `lastmod` real das partidas (campo `lastUpdated`) e sem `lastmod` nas páginas fixas.
- Badge de campeonato como link real (navegação SPA no clique simples) e links para campeonatos e times no rodapé.
- Arquivo de verificação do Google Search Console (branch `chore/gsc-verification`).

### Alterado

- Rotas desconhecidas, campeonatos inexistentes e partidas fora da agenda passam a `noindex, follow` com canonical na home; caixa e barra final das rotas são normalizadas.
- Metas centralizadas por rota (title, description, Open Graph, Twitter, canonical, robots); description de `/campeonato/*` com o próximo jogo (horário de Brasília) e canais só quando confirmados; `og:image` com escudo em times e partidas.
- Home com title e description cobrindo "hoje e da semana".
- JSON-LD `SportsEvent` com `eventStatus`, `homeTeam`/`awayTeam` e `inLanguage`; `organizer` omitido quando a competição não está mapeada (sem fallback para a CBF).
- `Cache-Control: public, max-age=31536000, immutable` apenas para `main/polyfills/chunk/styles-<hash>`.

### Corrigido

- **Revisão do QA (SEO)**: sitemap sem partidas cujo horário de início já passou (data + hora BRT); partidas encerradas ou passadas ficam `noindex, follow` com canonical na própria URL (ao vivo continua indexável); JSON-LD da página de campeonato só depois do load e limpo no erro e no estado vazio; `eventStatus` somente em partidas que não passaram; regex de cache imutável aceita hashes em maiúsculas, minúsculas e dígitos.
- `/favoritos` passa a `noindex, follow`; `broadcaster` removido do `SportsEvent` (canais vão em `description`, só quando confirmados); links do rodapé com alvo de toque de 24 px ou mais.

### Observações

- `trailingSlash` do Vercel não foi alterado (não verificável sem preview); a barra final é normalizada no cliente.
- Não há SSR/prerender: title, canonical e JSON-LD por rota continuam dependendo de JavaScript.

---

## [1.5.0] — 2026-10-20

### Adicionado

- UEFA Champions League: jogos da ESPN (`uefa.champions`) no populate, sem filtro de times brasileiros, e no placar/odds ao vivo.
- Página `/campeonato/champions-league` com tabela da fase de liga, próximos jogos e notícias, além de entrada no sitemap e em busca, filtro e favoritos de campeonato.
- Rótulo "Fase de Liga" para a fase atual nos jogos do campeonato.

### Corrigido

- **Revisão do QA (Champions)**: página de campeonato com alerta e "Tentar novamente" quando classificação e jogos falham (falha parcial tolerada), estado vazio e sem tabela incompleta, JSON-LD só com partidas do campeonato da rota; Gemini nunca é fonte de transmissão da Champions.

### Observações

- Sem transmissão confirmada para a Champions no Brasil: o populate não inventa canais e deixa a lista vazia quando as fontes existentes não informam.

---

## [1.4.1] — 2026-10-15

### Alterado

- Logos ESPN servidos pelo combiner em resolução proporcional ao tamanho exibido, com dimensões explícitas, decodificação assíncrona e carregamento tardio nas listas; três primeiros cards da agenda mantidos sem lazy.
- URLs das partidas memoizadas por lista para evitar recalcular slugs a cada ciclo de filtros, preservando permalinks e desambiguação.

### Corrigido

- **Revisão do QA E1**: removida a altura mínima de uma viewport do main, restaurando altura e rodapé das páginas curtas; rodapé revelado após o loading no layout flex existente. Reserva do título da partida limitada ao carregamento, sem linhas extras após carregar ou no 404. Logos tentam a URL original uma vez antes de ocultar em caso de falha do combiner.

---

## [1.4.0] — 2026-10-15

### Adicionado

- Favoritos de times e campeonatos salvos neste navegador, sem cadastro, com botões de estrela acessíveis e indicadores nos chips.
- Visão Meus favoritos em /favoritos, com contador, próximos jogos dos times ou campeonatos salvos e orientação quando a lista está vazia.
- Chips de times favoritos exibidos primeiro, preservando a ordem original dentro de cada grupo.

### Corrigido

- **Observações do QA D1**: acesso a Meus favoritos reposicionado ao lado de Todos os times, sem linha adicional; itens inválidos do armazenamento são filtrados sem perder favoritos válidos; botão de estrela com largura estável ao alternar.
- Inicialização protegida contra localStorage bloqueado e JSON inválido, inclusive nas leituras antigas de preferências de notificação.

---

## [1.3.1] — 2026-10-15

### Corrigido

- Campeonato incluído no title, og:title e h1 das partidas acessadas por slug desambiguado; títulos de URLs sem sufixo preservados.
- URLs de times no sitemap geradas apenas a partir de documentos com mandante e visitante preenchidos, preservando times históricos válidos.
- Removidos os SportsEvent da agenda doméstica em /copa-2026, inclusive na navegação interna, sem alterar os eventos da home, /ao-vivo e páginas de partidas.

---

## [1.3.0] — 2026-10-15

### Adicionado

- Partidas de hoje em diante no sitemap, com data de Brasília, lastmod, atualização diária e URLs deduplicadas.

### Corrigido

- Colisão de slugs entre partidas dos mesmos times e data: todos os colidentes recebem o sufixo do campeonato; slugs sem colisão são preservados, e o slug antigo continua abrindo a primeira partida. Nomes de campeonatos que geram o mesmo sufixo recebem também uma identificação determinística.
- Title, og:title, og:url e canonical de /ao-vivo e /copa-2026, tanto no acesso direto quanto na navegação interna, com restauração ao voltar para a home.

---

## [1.2.0] — 2026-10-15

### Adicionado

- Página individual da partida em `/jogo/:slug`, com confronto, data e horário de Brasília, transmissão, placar, compartilhamento no WhatsApp e calendário.
- Link acessível "Ver detalhes" nos cards e estados de carregamento, erro com nova tentativa e partida não encontrada.
- Title, descrição, Open Graph, canonical e JSON-LD SportsEvent próprios da partida, reutilizando os dados e helpers existentes.

### Corrigido

- Horário de meia-noite da Copa 2026 preservado no link de calendário, com conversão para UTC a partir do horário de Brasília.
- **Observações do QA C2**: calendário oculto para partidas encerradas também na página individual; compartilhamento do permalink usa data absoluta, mantendo Hoje/Amanhã nos cards da home.

---

## [1.1.2] — 2026-10-15

### Alterado

- Extração do card de jogo para o componente standalone `JogoCardComponent`, sem mudança visual ou de comportamento.

### Corrigido

- **Regressão de CSS na extração do card (QA C1)**: restaurados os estilos compartilhados de status, horário, placar, estádio, badges e confronto nas listas de campeonato/Copa, com os valores originais, modo escuro e breakpoints em `_jogo-shared.scss`. A animação `pulsar` passou a ter uma única definição global.

---

## [1.1.1] — 2026-10-15

### Corrigido

- **App derrubado em navegadores sem suporte a FCM** (ex.: iOS Safari fora do PWA): o Firebase Messaging era inicializado no construtor do serviço de push e lançava erro. Agora usa `isSupported()` e inicializa sob demanda; sem suporte, as notificações ficam desativadas e o resto do app funciona.
- **`getToken` podia ficar pendente para sempre** quando não havia service worker registrado; agora expira em 5 s e retorna `null`.

### Alterado

- **Testes automatizados**: `ng test` voltou a passar (18 testes) cobrindo carregamento, erro/retry, busca, filtros combinados, datas em America/Sao_Paulo (incluindo virada de dia UTC), WhatsApp e o serviço de push.

---

## [1.1.0] — 2026-10-15

### Adicionado

- **Busca**: campo para buscar jogos por time ou campeonato, sem diferenciar acentos nem maiúsculas.
- **Filtros de data e canal/plataforma**: seletores com apenas as datas e os canais presentes nos jogos carregados, mais botão "Limpar filtros".
- **Compartilhar no WhatsApp**: botão em cada card com jogo, horário, canais de transmissão e link do site.
- **"Amanhã"** na exibição da data dos jogos (além de "Hoje").
- **Estado de erro com "Tentar novamente"** para recarregar os jogos sem atualizar a página.
- **Acessibilidade**: `aria-pressed` em filtros e chips de times, `aria-label`/`role="article"` nos cards, `role="status"`/`role="alert"` nos estados de carga e erro.
- **ROADMAP.md** com o estado real das funcionalidades e `.env.example` completo (MongoDB, Firebase, `ADMIN_SECRET`).

### Alterado

- **Zoom liberado no mobile**: removidos `maximum-scale=1` e `user-scalable=no` do viewport.
- **Datas em America/Sao_Paulo** calculadas via `Intl` (antes por deslocamento manual de -3h).
- **README** atualizado: banco MongoDB, Node 20.19+ e variáveis de ambiente.

### Corrigido

- **Populate quebrado (`ESPN API error: 400`)**: a ESPN passou a rejeitar intervalos `dates=YYYYMMDD-YYYYMMDD`. Criado `fetchEspn`, que busca o ano e filtra pelo período, aplicado ao populate, placar, ligas e Copa 2026. Sem isso o `/api/jogos` retornava lista vazia.
- **Backend não iniciava sem credenciais do Firebase**: a inicialização do Firebase agora é sob demanda e a falta de `MONGODB_URI` gera erro explícito.
- **Canonical ausente na carga inicial da home**: agora é definido já ao abrir a página.

---

## [1.0.3] — 2026-06-24

### Corrigido

- **Copa 2026 — fase eliminatória antecipada**: `detectPhase()` consultava a ESPN com janela de +7 dias no futuro, fazendo o mata-mata aparecer desde 22/06 ao encontrar jogos de `round-of-32` agendados para 28/06. Janela limitada ao dia atual (BRT) para só mudar de fase quando os jogos realmente chegam.
- **Copa 2026 — layout mata-mata quebrado**: classes `confrontos-grid`, `mm-card`, `mm-teams`, `mm-team`, `mm-team-logo` e demais não tinham CSS definido, causando layout em texto puro e bandeiras enormes. Adicionado CSS completo para a fase eliminatória com cards em grid responsivo.
- **Mobile — card width inconsistente**: `main.container` encolhia baseado no conteúdo (366px com 1 card, 412px com vários) porque `.page` é `flex-direction: column` e `flex: 1` só controla altura, não largura. Corrigido adicionando `width: 100%` ao `.container` e `align-items: stretch` ao `.conteudo-wrapper`.

### Adicionado

- **Dev — override de fase via query param**: endpoint `/api/copa-2026/classificacao?fase=<slug>` aceita parâmetro para forçar uma fase específica localmente sem reiniciar o servidor, facilitando testes de layout.

---

## [1.0.2] — 2026-06-17

### Corrigido

- **Scraper CazéTV no CI**: GitHub Actions recebe menos vídeos que o ambiente local porque o Puppeteer em modo headless é detectado pelo YouTube como bot (IPs do Azure) e serve uma página diferente. Solução: scraper reescrito para usar `fetch` direto — `ytInitialData` é server-side rendered no HTML e não exige browser. Isso elimina totalmente a detecção de bot e garante os mesmos resultados em CI e localmente.
- **Workflow mais rápido**: adicionado `PUPPETEER_SKIP_DOWNLOAD=true` no `npm ci` do workflow `scrape-caze-highlights.yml` — o scraper de highlights não usa mais Chrome, economizando ~1min por execução.

---

## [1.0.1] — 2026-06-17

### Corrigido

- **Scraper CazéTV**: YouTube migrou o modelo de dados interno de `videoRenderer` para `lockupViewModel` em 2024. O scraper estava tentando navegar pelo caminho antigo e retornava 0 vídeos. Corrigido o parser para usar `lockupViewModel.contentId` (ID do vídeo) e `lockupViewModel.metadata.lockupMetadataViewModel.title.content` (título).
- **Regex de score mais robusto**: Substituída a classe `[\d()\s]+` (dependia de backtracking implícito) por `\d+(?:\s*\(\d+\))?\s*[xX]\s*(?:\(\d+\)\s*)?\d+`, que também suporta placares de pênaltis como `0 (5) X (3) 0`.

---

## [1.0.0] — 2026-06-17

Primeira versão versionada formalmente. O projeto já estava em produção com todas as funcionalidades abaixo.

### Adicionado

**Copa do Mundo 2026**
- Página dedicada `/copa-2026` com contagem regressiva até o início da competição
- Fase de grupos: tabela de classificação para os 12 grupos (A–L) com navegação de rodadas por grupo (setas ‹ ›)
- Standings provisórios ao vivo durante partidas em andamento
- Fase eliminatória: bracket de mata-mata com resultado e classificado destacado
- Detecção automática de fase via ESPN API (`group-stage`, `round-of-16`, `quarterfinals`, etc.)
- Placares ao vivo atualizados a cada 10 segundos
- Badge "Seguindo X time" no hero da Copa
- Sidebar de grupos no desktop

**Melhores Momentos (CazéTV YouTube)**
- Scraper Puppeteer busca vídeos "MELHORES MOMENTOS | COPA DO MUNDO" no canal [@CazeTV](https://www.youtube.com/@CazeTV/videos)
- Scroll incremental para contornar o infinite scroll do YouTube (até 15 iterações)
- Match por nome de seleção normalizado (sem acento/lowercase) contra jogos no MongoDB
- Botão "▶ Melhores momentos" aparece nos cards dos jogos encerrados com link disponível
- Workflow GitHub Actions roda 3× ao dia (05h, 11h, 17h BRT) durante o período da Copa

**Scrapers de Transmissão**
- Scraper FutebolExpert.com.br para canais dos jogos da Copa 2026
- Scraper GE Globo (rodada e artigos individuais) para jogos do Brasileirão, Libertadores, Sul-Americana e Copa do Brasil
- Fallback via Google Gemini para jogos sem fonte de transmissão encontrada (até 4 dias à frente)
- Classificação de canais: TV aberta/fechada vs. streaming

**Push Notifications de Gols**
- Integração com Firebase Cloud Messaging (FCM)
- Assinatura por time e por jogo específico
- Deduplicação de notificações via coleção `gols-notificados` no MongoDB
- Toast visual na interface ao receber notificação de gol

**Infraestrutura**
- Migração de Firestore para MongoDB Atlas como banco principal
- Deploy via Vercel (backend Node.js/Express + frontend Angular)
- GitHub Actions com workflows automatizados:
  - `populate.yml` — 5× ao dia para jogos domésticos
  - `populate-copa.yml` — 4× ao dia para jogos da Copa
  - `scrape-caze-highlights.yml` — 3× ao dia para melhores momentos
- Cache em memória no backend (5min jogos, 5min classificação, 60s placares)
- Edge cache Vercel para reduzir leituras no banco

**Frontend**
- Angular 21 com Signals e componentes standalone
- Dark mode automático via `prefers-color-scheme`
- Service Worker / PWA com cache de assets
- Pull-to-refresh no mobile
- Tradução de nomes de países (ESPN inglês → português)
- Logos das seleções via ESPN CDN
- Filtros: ao vivo, por time, Brasil, campeonato
- Classificação lateral no desktop
- Vercel Analytics integrado

**Versionamento**
- Badge `vX.Y.Z` no footer linkando para este changelog
- Fonte da verdade: `frontend/src/app/version.ts`

---

## Como bumpar a versão

1. Atualize `frontend/src/app/version.ts` com a nova versão
2. Adicione uma nova seção neste arquivo seguindo o formato `## [X.Y.Z] — YYYY-MM-DD`
3. Faça commit e push

Convenção de versionamento: `MAJOR.MINOR.PATCH`
- **MAJOR** — mudança de experiência ou arquitetura significativa
- **MINOR** — nova funcionalidade
- **PATCH** — correção de bug ou ajuste pequeno
