// app.js monta a aplicação Express inteira, mas sem escutar porta.
// O server.js só chama app.listen() — assim os testes importam o app direto.
const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();

const CATEGORIAS = [
  'alimentação',
  'transporte',
  'moradia',
  'lazer',
  'saúde',
  'educação',
  'salário',
  'outros',
];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// valida e normaliza o corpo da requisição; devolve { error } ou { transacao }
function validar(body) {
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
  const valor = Number(body.valor);

  if (!descricao) return { error: 'Descrição é obrigatória.' };
  if (!Number.isFinite(valor) || valor <= 0) return { error: 'O valor deve ser maior que zero.' };
  if (!['despesa', 'receita'].includes(body.tipo)) return { error: 'Tipo inválido.' };
  if (!CATEGORIAS.includes(body.categoria)) return { error: 'Categoria inválida.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.data) || isNaN(Date.parse(body.data))) {
    return { error: 'Data inválida.' };
  }

  return {
    transacao: {
      descricao,
      valor,
      tipo: body.tipo,
      categoria: body.categoria,
      data: body.data,
    },
  };
}

// ------- transações -------

app.get('/api/transactions', (req, res) => {
  try {
    const { month, category } = req.query;
    const clausulas = [];
    const params = {};

    if (month) {
      clausulas.push('substr(data, 1, 7) = @month');
      params.month = month;
    }
    if (category) {
      clausulas.push('categoria = @category');
      params.category = category;
    }

    const sql = `
      SELECT id, descricao, valor, tipo, categoria, data
      FROM transacoes
      ${clausulas.length ? 'WHERE ' + clausulas.join(' AND ') : ''}
      ORDER BY data DESC, id DESC
    `;

    res.json(db.prepare(sql).all(params));
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível listar as transações.' });
  }
});

app.post('/api/transactions', (req, res) => {
  try {
    const { transacao, error } = validar(req.body);
    if (error) return res.status(400).json({ error });

    const info = db
      .prepare(
        `INSERT INTO transacoes (descricao, valor, tipo, categoria, data)
         VALUES (@descricao, @valor, @tipo, @categoria, @data)`
      )
      .run(transacao);

    res
      .status(201)
      .json(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível salvar a transação.' });
  }
});

app.put('/api/transactions/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { transacao, error } = validar(req.body);
    if (error) return res.status(400).json({ error });

    const info = db
      .prepare(
        `UPDATE transacoes
         SET descricao = @descricao, valor = @valor, tipo = @tipo, categoria = @categoria, data = @data
         WHERE id = @id`
      )
      .run({ ...transacao, id });

    if (info.changes === 0) return res.status(404).json({ error: 'Transação não encontrada.' });

    res.json(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível atualizar a transação.' });
  }
});

app.delete('/api/transactions/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM transacoes WHERE id = ?').run(Number(req.params.id));
    if (info.changes === 0) return res.status(404).json({ error: 'Transação não encontrada.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível excluir a transação.' });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    const { month, category } = req.query;
    const clausulas = [];
    const params = {};

    if (month) {
      clausulas.push('substr(data, 1, 7) = @month');
      params.month = month;
    }
    if (category) {
      clausulas.push('categoria = @category');
      params.category = category;
    }

    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor END), 0) AS despesas,
        COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor END), 0) AS receitas
      FROM transacoes
      ${clausulas.length ? 'WHERE ' + clausulas.join(' AND ') : ''}
    `;

    const row = db.prepare(sql).get(params);
    res.json({ receitas: row.receitas, despesas: row.despesas, saldo: row.receitas - row.despesas });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível calcular o resumo.' });
  }
});

// ------- orçamentos mensais por categoria -------

// lista os orçamentos junto com o gasto acumulado do mês em cada categoria.
// gasto > limite vem marcado com estourado=true pra interface destacar o alerta.
app.get('/api/budgets', (req, res) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    const clausulas = month ? 'WHERE substr(data, 1, 7) = @month' : '';
    const gastos = db
      .prepare(
        `SELECT categoria, SUM(valor) AS gasto
         FROM transacoes
         ${clausulas}
         GROUP BY categoria`
      )
      .all(month ? { month } : {});

    const gastoPorCategoria = new Map(gastos.map((g) => [g.categoria, g.gasto]));
    const orcamentos = db.prepare('SELECT categoria, limite FROM orcamentos ORDER BY categoria').all();

    res.json(
      orcamentos.map((o) => {
        const gasto = gastoPorCategoria.get(o.categoria) || 0;
        return {
          categoria: o.categoria,
          limite: o.limite,
          gasto,
          restante: o.limite - gasto,
          estourado: gasto > o.limite,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível listar os orçamentos.' });
  }
});

// cria ou atualiza o limite de uma categoria em uma transação só (upsert)
app.post('/api/budgets', (req, res) => {
  try {
    const limite = Number(req.body.limite);
    if (!CATEGORIAS.includes(req.body.categoria)) return res.status(400).json({ error: 'Categoria inválida.' });
    if (!Number.isFinite(limite) || limite <= 0) {
      return res.status(400).json({ error: 'O limite deve ser maior que zero.' });
    }

    db.prepare(
      `INSERT INTO orcamentos (categoria, limite) VALUES (@categoria, @limite)
       ON CONFLICT(categoria) DO UPDATE SET limite = @limite`
    ).run({ categoria: req.body.categoria, limite });

    res.status(201).json(db.prepare('SELECT categoria, limite FROM orcamentos WHERE categoria = ?').get(req.body.categoria));
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível salvar o orçamento.' });
  }
});

app.delete('/api/budgets/:categoria', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM orcamentos WHERE categoria = ?').run(req.params.categoria);
    if (info.changes === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível excluir o orçamento.' });
  }
});

// ------- erros -------

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

module.exports = { app, CATEGORIAS };
