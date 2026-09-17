// testes da API. Rodam com `npm test` (node --test, sem dependência externa).
// Cada execução usa um banco separado (test.db) pra não encostar no financeiro.db real.
process.env.DB_FILE = 'test.db';

const path = require('path');
const fs = require('fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { app } = require('../app');
const db = require('../db');

let BASE;
let server;

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  // sem isso o runner fica pendurado esperando o servidor fechar
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const sufixo of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(__dirname, '..', `test.db${sufixo}`), { force: true });
  }
});

// ------- transações -------

test('POST cria transação válida e devolve 201', async () => {
  const { status, corpo } = await req('POST', '/api/transactions', {
    descricao: 'Mercado',
    valor: 150.75,
    tipo: 'despesa',
    categoria: 'alimentação',
    data: '2026-09-10',
  });
  assert.equal(status, 201);
  assert.equal(corpo.descricao, 'Mercado');
  assert.equal(corpo.valor, 150.75);
  assert.ok(corpo.id > 0);
});

test('POST rejeita valor negativo com 400', async () => {
  const { status, corpo } = await req('POST', '/api/transactions', {
    descricao: 'Ruim',
    valor: -5,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '2026-09-10',
  });
  assert.equal(status, 400);
  assert.match(corpo.error, /maior que zero/);
});

test('POST rejeita categoria que não existe', async () => {
  const { status } = await req('POST', '/api/transactions', {
    descricao: 'X',
    valor: 10,
    tipo: 'despesa',
    categoria: 'criptomoeda',
    data: '2026-09-10',
  });
  assert.equal(status, 400);
});

test('POST rejeita data em formato errado', async () => {
  const { status } = await req('POST', '/api/transactions', {
    descricao: 'X',
    valor: 10,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '10/09/2026',
  });
  assert.equal(status, 400);
});

test('POST rejeita corpo sem descrição', async () => {
  const { status } = await req('POST', '/api/transactions', {
    valor: 10,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '2026-09-10',
  });
  assert.equal(status, 400);
});

test('GET lista transações do mês filtrado', async () => {
  await req('POST', '/api/transactions', {
    descricao: 'Outubro',
    valor: 30,
    tipo: 'despesa',
    categoria: 'transporte',
    data: '2026-10-05',
  });

  const setembro = await req('GET', '/api/transactions?month=2026-09');
  assert.equal(setembro.status, 200);
  assert.ok(setembro.corpo.every((t) => t.data.startsWith('2026-09')));

  const outubro = await req('GET', '/api/transactions?month=2026-10');
  assert.equal(outubro.corpo.length, 1);
  assert.equal(outubro.corpo[0].descricao, 'Outubro');
});

test('GET filtra por categoria combinada com mês', async () => {
  const { status, corpo } = await req('GET', '/api/transactions?month=2026-09&category=alimentação');
  assert.equal(status, 200);
  assert.ok(corpo.length > 0);
  assert.ok(corpo.every((t) => t.categoria === 'alimentação'));
});

test('PUT atualiza transação existente', async () => {
  const criada = await req('POST', '/api/transactions', {
    descricao: 'Antes',
    valor: 10,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '2026-09-12',
  });

  const { status, corpo } = await req('PUT', `/api/transactions/${criada.corpo.id}`, {
    descricao: 'Depois',
    valor: 99,
    tipo: 'receita',
    categoria: 'salário',
    data: '2026-09-13',
  });
  assert.equal(status, 200);
  assert.equal(corpo.descricao, 'Depois');
  assert.equal(corpo.tipo, 'receita');
});

test('PUT em id inexistente devolve 404', async () => {
  const { status } = await req('PUT', '/api/transactions/999999', {
    descricao: 'X',
    valor: 10,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '2026-09-12',
  });
  assert.equal(status, 404);
});

test('DELETE remove e depois 404 na segunda vez', async () => {
  const criada = await req('POST', '/api/transactions', {
    descricao: 'Pra apagar',
    valor: 5,
    tipo: 'despesa',
    categoria: 'outros',
    data: '2026-09-12',
  });

  const primeira = await req('DELETE', `/api/transactions/${criada.corpo.id}`);
  assert.equal(primeira.status, 204);

  const segunda = await req('DELETE', `/api/transactions/${criada.corpo.id}`);
  assert.equal(segunda.status, 404);
});

test('summary calcula receitas, despesas e saldo do mês', async () => {
  // mês exclusivo desse teste, pra não herdar dados dos testes de cima
  await req('POST', '/api/transactions', {
    descricao: 'Salário novembro',
    valor: 1000,
    tipo: 'receita',
    categoria: 'salário',
    data: '2026-11-05',
  });
  await req('POST', '/api/transactions', {
    descricao: 'Lazer novembro',
    valor: 250,
    tipo: 'despesa',
    categoria: 'lazer',
    data: '2026-11-06',
  });

  const { status, corpo } = await req('GET', '/api/summary?month=2026-11');
  assert.equal(status, 200);
  assert.equal(corpo.receitas, 1000);
  assert.equal(corpo.despesas, 250);
  assert.equal(corpo.saldo, 750);
});

// ------- orçamentos -------

test('POST define orçamento e GET mostra gasto e restante', async () => {
  const criado = await req('POST', '/api/budgets', { categoria: 'alimentação', limite: 400 });
  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.limite, 400);

  const { status, corpo } = await req('GET', '/api/budgets?month=2026-09');
  assert.equal(status, 200);

  const alimentacao = corpo.find((o) => o.categoria === 'alimentação');
  assert.ok(alimentacao);
  assert.equal(alimentacao.limite, 400);
  assert.equal(alimentacao.gasto, 150.75);
  assert.equal(alimentacao.restante, 400 - 150.75);
  assert.equal(alimentacao.estourado, false);
});

test('POST no mesmo categoria atualiza o limite (upsert)', async () => {
  const { status } = await req('POST', '/api/budgets', { categoria: 'alimentação', limite: 100 });
  assert.equal(status, 201);

  const { corpo } = await req('GET', '/api/budgets?month=2026-09');
  const alimentacao = corpo.find((o) => o.categoria === 'alimentação');
  assert.equal(alimentacao.limite, 100);
  assert.equal(alimentacao.estourado, true); // 150.75 de gasto > 100 de limite
});

test('POST rejeita orçamento com limite inválido', async () => {
  const zero = await req('POST', '/api/budgets', { categoria: 'lazer', limite: 0 });
  assert.equal(zero.status, 400);

  const categoriaRuim = await req('POST', '/api/budgets', { categoria: 'viagem', limite: 100 });
  assert.equal(categoriaRuim.status, 400);
});

test('DELETE remove orçamento', async () => {
  await req('POST', '/api/budgets', { categoria: 'transporte', limite: 200 });

  const { status } = await req('DELETE', '/api/budgets/transporte');
  assert.equal(status, 204);

  const depois = await req('GET', '/api/budgets?month=2026-09');
  assert.ok(!depois.corpo.some((o) => o.categoria === 'transporte'));
});

test('DELETE de orçamento inexistente devolve 404', async () => {
  const { status } = await req('DELETE', '/api/budgets/moradia');
  assert.equal(status, 404);
});
