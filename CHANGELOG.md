# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

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
