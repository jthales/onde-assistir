# Onde Assistir

Aplicação web que exibe os jogos de futebol da semana no Brasil com informações de onde assistir — canais de TV aberta/fechada e plataformas de streaming.

## Como funciona

```
ESPN API ──► populate.ts ──► Firestore ──► Backend API ──► Frontend Angular
               + Gemini
             (transmissões)
```

1. **`npm run populate`** busca os fixtures reais da ESPN, enriquece com informações de transmissão via Gemini e salva no Firestore.
2. O **backend** serve os dados do Firestore via `GET /api/jogos`.
3. O **frontend** Angular exibe os jogos com filtro visual por time.

## Stack

- **Frontend:** Angular 21 (standalone, signals)
- **Backend:** Node.js + Express + TypeScript
- **Banco de dados:** Firebase Firestore
- **Dados de jogos:** ESPN public API
- **Transmissões:** Google Gemini (`gemini-3.1-flash-lite-preview`)

## Configuração

### Pré-requisitos

- Node.js 18+
- Conta no Firebase (Firestore)
- Chave de API do Google Gemini

### Backend

```bash
cd backend
npm install
```

Crie o arquivo `.env`:
```env
GEMINI_API_KEY=sua_chave_aqui
```

Adicione o arquivo `serviceAccount.json` na raiz do `backend/` com as credenciais do Firebase Admin SDK.

### Frontend

```bash
cd frontend
npm install
```

## Rodando localmente

### 1. Popular o Firestore com os jogos da semana

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
| `backend: npm run populate` | Busca jogos na ESPN + transmissões no Gemini e salva no Firestore |
| `backend: npm start` | Inicia o servidor Express |
| `frontend: ng serve` | Inicia o servidor de desenvolvimento Angular |
| `frontend: ng build` | Gera o build de produção |
