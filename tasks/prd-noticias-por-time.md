# PRD: Notícias do Time na Página de Filtro

## Introduction

Quando o usuário filtra por um time (ou acessa diretamente a URL do time, como `/flamengo`), a página deve exibir uma seção de notícias relacionadas ao time, buscadas da ESPN. Cada notícia inclui título, imagem de capa, resumo e um link que abre o artigo completo em nova aba. A seção só aparece se houver notícias disponíveis.

## Goals

- Enriquecer a página de cada time com conteúdo editorial relevante
- Usar a ESPN como fonte de notícias, aproveitando integração já existente no backend
- Manter a experiência limpa: ocultar a seção se não houver notícias ou se a API falhar
- Não bloquear a renderização dos jogos enquanto as notícias carregam

## User Stories

### US-001: Endpoint de notícias no backend
**Description:** As a developer, I need a backend endpoint that fetches news for a specific team from the ESPN API so the frontend can display them.

**Acceptance Criteria:**
- [ ] Criar `GET /api/noticias/:timeSlug` no backend (`backend/src/index.ts`)
- [ ] Recebe o slug do time (ex: `flamengo`) e mapeia para o ID do time na ESPN usando `TEAM_NAME_MAP` ou mapa próprio
- [ ] Chama `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/news?team=TEAM_ID&limit=5`
- [ ] Retorna array de até 5 notícias com os campos: `titulo`, `descricao`, `imagem` (URL), `link` (URL da notícia na ESPN), `publicadoEm` (ISO string)
- [ ] Cache em memória de 10 minutos para evitar excesso de chamadas à ESPN
- [ ] Em caso de erro ou time não mapeado, retorna `[]` com status 200 (não quebra o frontend)
- [ ] Typecheck passa (`npm run build` no backend)

### US-002: Método de notícias no JogosService
**Description:** As a developer, I need a method in JogosService that calls the new backend endpoint so the component can fetch news reactively.

**Acceptance Criteria:**
- [ ] Adicionar `getNoticias(timeSlug: string): Observable<Noticia[]>` em `frontend/src/app/services/jogos.service.ts`
- [ ] Adicionar interface `Noticia` em `frontend/src/app/models/jogo.ts` com campos: `titulo: string`, `descricao: string`, `imagem: string`, `link: string`, `publicadoEm: string`
- [ ] Typecheck passa (`ng build` ou `tsc --noEmit` no frontend)

### US-003: Carregar notícias ao selecionar/detectar time
**Description:** As a developer, I need the component to fetch news whenever a team is selected or detected from the URL so the news section stays in sync with the current filter.

**Acceptance Criteria:**
- [ ] Em `app.ts`, adicionar signal `noticias = signal<Noticia[]>([])`
- [ ] Ao selecionar um time (`selecionarTime`), chamar `carregarNoticias(slug)` e atualizar o signal
- [ ] Ao detectar time via URL no `carregarDados`, também chamar `carregarNoticias(slug)`
- [ ] Ao limpar o filtro (sem time selecionado), limpar o signal: `noticias.set([])`
- [ ] Erros na busca de notícias são silenciosos (não mostrar mensagem de erro, apenas `noticias.set([])`)
- [ ] Typecheck passa

### US-004: Exibir seção de notícias abaixo dos jogos
**Description:** As a user, I want to see relevant news about the selected team below the game list so I can stay informed without leaving the page.

**Acceptance Criteria:**
- [ ] A seção de notícias só é renderizada quando `noticias().length > 0`
- [ ] A seção aparece abaixo da lista de jogos (`jogosFiltrados`) e acima da tabela de classificação (se houver)
- [ ] Título da seção: "Notícias sobre [Nome do Time]"
- [ ] Cada card de notícia exibe: imagem de capa (com fallback se imagem quebrada), título, resumo/descrição e um link "Ler mais"
- [ ] O link abre em nova aba (`target="_blank" rel="noopener noreferrer"`)
- [ ] Cards exibidos em grid responsivo: 1 coluna no mobile, 2–3 colunas no desktop
- [ ] Typecheck passa
- [ ] Verificar no browser usando a skill dev-browser

### US-005: Estilo visual dos cards de notícia
**Description:** As a user, I want the news cards to look consistent with the rest of the app so the experience feels cohesive.

**Acceptance Criteria:**
- [ ] Cards usam a mesma paleta de cores e border-radius do restante da UI (variáveis CSS existentes)
- [ ] Imagem ocupa a largura total do card, height fixo com `object-fit: cover`
- [ ] Título em negrito, descrição em fonte menor e cor mais clara
- [ ] Estado de hover no card com transição suave de sombra ou borda
- [ ] Totalmente responsivo em mobile (375px) e desktop (1280px+)
- [ ] Verificar no browser usando a skill dev-browser

## Functional Requirements

- FR-1: O backend deve expor `GET /api/noticias/:timeSlug` retornando até 5 notícias da ESPN para aquele time
- FR-2: O backend deve ter um mapa de `slug → ESPN team ID` para os 20 times do Brasileirão
- FR-3: O backend deve cachear as respostas da ESPN por 10 minutos por time
- FR-4: O frontend só busca notícias quando há um time selecionado
- FR-5: A seção de notícias é completamente ocultada se não houver notícias (sem mensagem de "sem notícias")
- FR-6: Cada notícia deve conter: título, descrição, imagem, link e data de publicação
- FR-7: Links de notícias abrem em nova aba com `rel="noopener noreferrer"`
- FR-8: A busca de notícias não bloqueia nem atrasa o carregamento dos jogos

## Non-Goals

- Não há cache de notícias no frontend (busca a cada seleção de time)
- Não há paginação ou "carregar mais" notícias
- Não há notificações push de novas notícias
- Não exibir notícias na página inicial (sem time selecionado)
- Não armazenar notícias no Firestore
- Não exibir notícias de campeonatos que não sejam o Brasileirão Série A

## Design Considerations

- Reaproveitar variáveis CSS já existentes em `app.scss` (cores, sombras, border-radius)
- A seção de notícias deve ter espaçamento consistente com as demais seções da página
- No mobile, 1 coluna. Em telas > 768px, 2 colunas. Em telas > 1024px, 3 colunas (ou 2, a definir conforme o layout atual)
- Imagem com aspect-ratio 16:9 ou height fixo de ~160px com `object-fit: cover`

## Technical Considerations

- A ESPN expõe notícias por time via: `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/news?team={TEAM_ID}&limit=5`
- O mapeamento de time para ESPN team ID precisa ser construído para os 20 times do Brasileirão 2025
- O backend já importa `TEAM_NAME_MAP` de `./constants` — o novo mapa de slug→ID pode ir no mesmo arquivo
- O frontend já usa signals do Angular — seguir o mesmo padrão para `noticias`
- A função `slugify` já existe no frontend e no backend — usar para consistência de slugs

## Success Metrics

- A seção de notícias aparece em menos de 2 segundos após selecionar um time
- Nenhuma regressão no carregamento dos jogos (tempo de carregamento não aumenta)
- Cards visualmente consistentes com o restante da UI em mobile e desktop

## Open Questions

- Quais são os ESPN team IDs dos 20 times do Brasileirão 2025? (a serem pesquisados durante a implementação)
- A ESPN retorna notícias em português ou apenas em inglês? (verificar durante implementação — pode ser necessário filtrar ou aceitar o que vier)
- Deve-se mostrar a data de publicação da notícia no card, ou apenas título, imagem, descrição e link?
