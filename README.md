# Onde Assistir

Aplicação web que exibe os jogos de futebol da semana no Brasil com informações de onde assistir — canais de TV aberta/fechada e plataformas de streaming.

## Como funciona

```
ESPN API ──► populate.ts ──► MongoDB ──► Backend API ──► Frontend Angular
               + Gemini
             (transmissões)
```

1. **`npm run populate`** busca os fixtures reais da ESPN, enriquece com informações de transmissão via Gemini e salva no MongoDB.
2. O **backend** serve os dados do MongoDB via `GET /api/jogos`.
3. O **frontend** Angular exibe os jogos com filtro visual por time.

## Stack

- **Frontend:** Angular 21 (standalone, signals)
- **Backend:** Node.js + Express + TypeScript
- **Banco de dados:** MongoDB (jogos) + Firebase Cloud Messaging (push)
- **Dados de jogos:** ESPN public API
- **Transmissões:** Google Gemini (`gemini-3.1-flash-lite-preview`)

## Configuração

### Pré-requisitos

- Node.js 20.19+ (veja `backend/.nvmrc`)
- Banco MongoDB (`MONGODB_URI`) e projeto Firebase (push)
- Chave de API do Google Gemini

### Backend

```bash
cd backend
npm install
```

Copie `backend/.env.example` para `backend/.env` e preencha `MONGODB_URI` (obrigatório para `/api/jogos`),
`GEMINI_API_KEY` (populate com Gemini) e as variáveis `FIREBASE_*` (apenas rotas de push).
Sem as variáveis do Firebase a API sobe normalmente; só as rotas de push retornam erro.

### Frontend

```bash
cd frontend
npm install
```

## Rodando localmente

### 1. Popular o banco com os jogos da semana

```bash
cd backend
npm run populate
```

### 2. Iniciar o backend

```bash
cd backend
npm start
# Servidor em http://localhost:3000
```

### 3. Iniciar o frontend

```bash
cd frontend
ng serve
# App em http://localhost:4200
```

## Scripts

| Comando | Descrição |
|---|---|
| `backend: npm run populate` | Busca jogos na ESPN + transmissões no Gemini e salva no MongoDB |
| `backend: npm start` | Inicia o servidor Express |
| `frontend: ng serve` | Inicia o servidor de desenvolvimento Angular |
| `frontend: ng build` | Gera o build de produção |
