const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, process.env.DB_FILE || 'financeiro.db'));

db.pragma('journal_mode = WAL'); // WAL deixa leitura e escrita concorrentes mais baratas no SQLite

// tabelas criadas automaticamente na primeira execução
db.exec(`
  CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor > 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
    categoria TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orcamentos (
    categoria TEXT PRIMARY KEY,
    limite REAL NOT NULL CHECK (limite > 0)
  )
`);

module.exports = db;
