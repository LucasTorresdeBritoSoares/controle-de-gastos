# Controle de Gastos Pessoais

[![CI](https://github.com/LucasTorresdeBritoSoares/controle-de-gastos/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasTorresdeBritoSoares/controle-de-gastos/actions/workflows/ci.yml)

> Aplicação web completa para controlar receitas e despesas do mês. Frontend em HTML/CSS/JS puro, servido por um backend em Node.js com banco SQLite.

Feito como primeiro projeto full stack pra valer: API REST, banco de dados, gráficos, orçamentos com alerta e testes automatizados, tudo do zero.

## Demo

🔗 **Deployado no Render:** https://controle-de-gastos-3fj5.onrender.com

> No plano gratuito, a primeira visita pode demorar ~50s porque o serviço "acorda" sob demanda.

## Funcionalidades

- CRUD completo de transações (criar, listar, editar e excluir)
- Cada transação possui: descrição, valor, tipo (despesa ou receita), categoria e data
- Dashboard do mês selecionado com saldo, total de receitas e total de despesas
- **Orçamentos por categoria**: defina um limite mensal e acompanhe com barra de progresso
  - barra amarela quando o gasto passa de 80% do limite
  - barra vermelha + alerta quando o orçamento estoura
- Gráfico de pizza com as despesas por categoria do mês
- Filtros combinados por mês e por categoria
- Modal para criar/editar com validação (valor > 0, descrição obrigatória, data válida)
- Lista ordenada por data (mais recente primeiro)
- Totais, lista e gráfico atualizam sem recarregar a página (fetch para a API)
- Layout responsivo, funcionando bem em celular

## Testes

A API tem cobertura de testes com o `node:test` nativo (sem dependência externa), rolando a cada push pelo GitHub Actions:

```bash
npm test
```

Os testes usam um banco separado (`test.db`), criado e apagado a cada execução.

## Como rodar

Pré-requisitos: Node.js 22 ou superior (LTS atual).

```bash
npm install
npm start
```

O servidor sobe na porta 3000. Abra http://localhost:3000.

O banco de dados (`financeiro.db`) é criado automaticamente na primeira execução, com as tabelas de transações e orçamentos já prontas.

## Tecnologias

| Camada    | Tecnologia                          |
|-----------|-------------------------------------|
| Backend   | Node.js + Express                   |
| Banco     | SQLite com better-sqlite3           |
| Frontend  | HTML, CSS e JavaScript puros        |
| Testes    | node:test (runner nativo do Node)   |
| CI        | GitHub Actions                      |
| Gráfico   | Chart.js (via CDN)                  |
| Fonte     | Roboto (Google Fonts)               |

## Estrutura de pastas

```
controle-de-gastos/
├── server.js        # sobe o app numa porta
├── app.js           # rotas e regras da API
├── db.js            # conexão e criação das tabelas
├── financeiro.db    # banco (criado na 1ª execução, fora do git)
├── test/
│   └── api.test.js  # testes da API
├── .github/workflows/ci.yml
├── package.json
└── public/
    ├── index.html   # página principal
    ├── style.css    # estilos (paleta slate)
    └── app.js       # lógica do frontend
```

## API

Todas as respostas são JSON, com código HTTP correto e `error` em caso de falha.

| Método | Rota                              | Descrição                                  |
|--------|-----------------------------------|--------------------------------------------|
| GET    | `/api/transactions`               | Lista transações. Query: `month=YYYY-MM`, `category` |
| POST   | `/api/transactions`               | Cria uma transação                          |
| PUT    | `/api/transactions/:id`           | Atualiza uma transação                      |
| DELETE | `/api/transactions/:id`           | Exclui uma transação                        |
| GET    | `/api/summary?month=YYYY-MM`      | Retorna `{ saldo, receitas, despesas }`     |
| GET    | `/api/budgets?month=YYYY-MM`      | Lista orçamentos com gasto, restante e `estourado` |
| POST   | `/api/budgets`                    | Cria ou atualiza o limite de uma categoria  |
| DELETE | `/api/budgets/:categoria`         | Remove o orçamento                          |

Exemplo de corpo para POST/PUT de transação:

```json
{
  "descricao": "Supermercado",
  "valor": 250.5,
  "tipo": "despesa",
  "categoria": "alimentação",
  "data": "2026-08-03"
}
```

Categorias fixas: alimentação, transporte, moradia, lazer, saúde, educação, salário e outros.

## Como fazer deploy

### Render

1. Suba o projeto para um repositório no GitHub.
2. No Render, crie um novo **Web Service** conectado ao repositório.
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Deploy automático a cada push na branch principal (e o CI roda os testes antes de você ver o resultado).

### Railway

1. Suba o projeto para um repositório no GitHub.
2. No Railway, crie um novo projeto e escolha **Deploy from GitHub repo**.
3. O Railway detecta o `package.json` e usa `npm start` automaticamente.

> Observação: o banco usa SQLite em arquivo, então o deploy mais simples é com disco persistente ativado no serviço. Para volume de dados grande, o ideal seria migrar para um banco em nuvem.
