# PRD: Brasileirão TV Guide

## Introduction

Aplicação web que exibe os jogos da Série A do Campeonato Brasileiro e em qual canal de TV ou plataforma de streaming cada partida será transmitida. A fonte de dados principal é a API do Gemini (modelo `gemini-3.1-flash-lite-preview`), que responde perguntas sobre os jogos da semana, times e canais de transmissão. O frontend é desenvolvido em Angular e o backend em Node.js (para proteger a chave da API do Gemini).

## API Key GEMINI

- GEMINI_API_KEY=AIzaSyAnozmFM8DWG2Bf5OzhK7DIoDkBFLCYoPU

## Goals

- Exibir os jogos da Série A da semana atual com data, hora, times e canal/streaming
- Utilizar a API do Gemini como fonte de dados principal
- Interface simples, pública e sem necessidade de login
- Backend Node.js como proxy seguro para a API do Gemini (chave nunca exposta ao cliente)
- MVP funcional com tempo de carregamento abaixo de 3 segundos

## User Stories

### US-001: Configurar backend Node.js com proxy para Gemini

**Description:** As a developer, I need a Node.js backend that securely calls the Gemini API so that the API key is never exposed in the frontend.

**Acceptance Criteria:**

- [ ] Projeto Node.js inicializado com Express (ou Fastify)
- [ ] Variável de ambiente `GEMINI_API_KEY` configurada via `.env`
- [ ] Endpoint `GET /api/jogos` que consulta o Gemini e retorna os jogos da semana em JSON
- [ ] CORS configurado para aceitar requisições do frontend Angular
- [ ] Prompt enviado ao Gemini solicita: times da Série A, data/hora, canal/streaming, rodada
- [ ] Resposta do Gemini é parseada e retornada como array de objetos JSON estruturados
- [ ] Typecheck/lint passa

### US-002: Modelar estrutura de dados dos jogos

**Description:** As a developer, I need a consistent data model for match information so that the frontend can reliably display it.

**Acceptance Criteria:**

- [ ] Interface/tipo definido para `Jogo`:
  ```
  {
    rodada: number,
    timeMandante: string,
    timeVisitante: string,
    data: string (ISO 8601),
    hora: string,
    canal: string[],       // ex: ["Globo", "Premiere"]
    streaming: string[],   // ex: ["Globoplay", "Cazé TV"]
    estadio: string
  }
  ```
- [ ] Backend retorna array de `Jogo` com dados reais vindos do Gemini
- [ ] Prompt do Gemini inclui instrução para retornar JSON válido no formato acima

### US-003: Criar serviço Angular para consumir a API

**Description:** As a developer, I need an Angular service that fetches game data from the backend so that components can display it.

**Acceptance Criteria:**

- [ ] Projeto Angular criado com Angular CLI
- [ ] `JogosService` criado com método `getJogosDaSemana(): Observable<Jogo[]>`
- [ ] Serviço faz `GET` para `http://localhost:3000/api/jogos`
- [ ] Interface `Jogo` definida em TypeScript no frontend
- [ ] Typecheck/lint passa

### US-004: Exibir lista de jogos da semana

**Description:** As a user, I want to see all Série A matches of the current week so that I know when and where to watch.

**Acceptance Criteria:**

- [ ] Página principal exibe cards para cada jogo da semana
- [ ] Cada card mostra: times (mandante x visitante), data formatada (ex: "Sábado, 22/03"), hora, estádio
- [ ] Cards ordenados cronologicamente (jogo mais próximo primeiro)
- [ ] Estado de loading exibido enquanto a API responde (spinner ou skeleton)
- [ ] Mensagem amigável exibida em caso de erro na API
- [ ] Typecheck/lint passa
- [ ] Verificar no browser usando dev-browser skill

### US-005: Exibir canais e plataformas de streaming por jogo

**Description:** As a user, I want to see which TV channels and streaming platforms will broadcast each match so that I can find where to watch.

**Acceptance Criteria:**

- [ ] Cada card exibe seção "Onde assistir" com ícone/badge para cada canal/streaming
- [ ] Canais de TV aberta (ex: Globo, Band) visualmente distintos dos de streaming (ex: Globoplay, Cazé TV)
- [ ] Se não houver transmissão confirmada, exibe "A confirmar"
- [ ] Typecheck/lint passa
- [ ] Verificar no browser usando dev-browser skill

### US-006: Filtrar jogos por time

**Description:** As a user, I want to filter matches by a specific team so that I can follow only my team.

**Acceptance Criteria:**

- [ ] Dropdown ou campo de busca com todos os 20 times da Série A
- [ ] Ao selecionar um time, apenas os jogos daquele time são exibidos
- [ ] Opção "Todos os times" para remover o filtro
- [ ] Filtro funciona localmente (sem nova chamada à API)
- [ ] Typecheck/lint passa
- [ ] Verificar no browser usando dev-browser skill

### US-007: Exibir aviso sobre limitações da IA

**Description:** As a user, I want to know that the information comes from an AI so that I understand it may not be 100% accurate.

**Acceptance Criteria:**

- [ ] Banner ou rodapé com texto: "Informações geradas por IA. Verifique nos canais oficiais."
- [ ] Exibido em todas as páginas
- [ ] Typecheck/lint passa
- [ ] Verificar no browser usando dev-browser skill

## Functional Requirements

- FR-1: O backend Node.js deve ter endpoint `GET /api/jogos` que consulta a API do Gemini com o modelo `gemini-3.1-flash-lite-preview`
- FR-2: O prompt enviado ao Gemini deve solicitar os jogos da Série A da semana atual (com data atual no prompt), times, horários, estádio, canais de TV e plataformas de streaming
- FR-3: O prompt deve instruir o Gemini a retornar **apenas JSON válido** sem markdown ou texto adicional
- FR-4: O frontend Angular deve exibir os jogos em cards ordenados por data/hora
- FR-5: Cada card deve exibir: times, data, hora, estádio, canais de TV e streaming
- FR-6: O filtro por time deve funcionar no lado do cliente, sem nova chamada ao backend
- FR-7: A chave `GEMINI_API_KEY` deve ser carregada apenas no backend via variável de ambiente
- FR-8: O frontend deve exibir estado de carregamento durante a requisição
- FR-9: O frontend deve exibir mensagem de erro caso a API falhe
- FR-10: Um aviso sobre precisão da IA deve estar visível em todas as telas

## Non-Goals

- Sem autenticação ou sistema de login
- Sem times fora da Série A (Série B, Copa do Brasil, Libertadores, etc.)
- Sem notificações push ou alertas
- Sem histórico de jogos passados
- Sem dados em tempo real de placar (live score)
- Sem cache persistente no Firebase (pode ser adicionado em iterações futuras)
- Sem versão mobile nativa (PWA não é escopo do MVP)

## Technical Considerations

- **Modelo Gemini:** `gemini-3.1-flash-lite-preview` via `@google/generative-ai` SDK no Node.js
- **Prompt Engineering:** O prompt deve incluir a data atual para que o Gemini identifique a semana correta. Exemplo de prompt base:
  ```
  Hoje é [DATA_ATUAL]. Liste todos os jogos da Série A do Brasileirão
  que acontecerão nos próximos 7 dias. Para cada jogo, retorne um JSON
  com os campos: rodada, timeMandante, timeVisitante, data (ISO 8601),
  hora, canal (array), streaming (array), estadio.
  Retorne APENAS o array JSON, sem explicações.
  ```
- **Limitação importante:** O Gemini pode não ter informações precisas de jogos futuros — o aviso ao usuário (US-007) é essencial
- **CORS:** Backend deve permitir origem do Angular dev server (`http://localhost:4200`)
- **Estrutura de pastas sugerida:**
  ```
  /backend    → Node.js + Express
  /frontend   → Angular app
  ```
- **Firebase:** Não utilizado no MVP; pode ser adicionado para cache das respostas do Gemini em iterações futuras

## Success Metrics

- Usuário consegue ver os jogos da semana em menos de 3 segundos após carregar a página
- Filtro por time funciona sem recarregar a página
- Nenhuma chave de API exposta no código do frontend
- Interface legível em desktop sem necessidade de scroll horizontal

## Open Questions

- O modelo `gemini-3.1-flash-lite-preview` tem conhecimento atualizado sobre o calendário do Brasileirão 2025/2026? Pode ser necessário testar a qualidade das respostas antes do lançamento.
- Caso as respostas do Gemini sejam inconsistentes, considerar usar uma API de esportes (ex: API-Football) como fonte primária e o Gemini apenas para formatação — isso seria uma iteração futura.
- Deseja deploy no Firebase Hosting para o frontend e Cloud Functions para o backend?
