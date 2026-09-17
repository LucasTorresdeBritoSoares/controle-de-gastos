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

// paleta fixa por categoria, pro gráfico e pros chips terem sempre a mesma cor
const CORES = {
  alimentação: '#f59e0b',
  transporte: '#3b82f6',
  moradia: '#8b5cf6',
  lazer: '#ec4899',
  saúde: '#ef4444',
  educação: '#06b6d4',
  salário: '#22c55e',
  outros: '#94a3b8',
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const state = {
  mes: mesAtual(),
  categoria: '',
  editandoId: null,
};

// orçamentos carregados, só pra saber quais categorias já têm limite
let orcamentosAtuais = [];

const el = {
  filtroMes: document.getElementById('filtro-mes'),
  filtroCategoria: document.getElementById('filtro-categoria'),
  saldo: document.getElementById('saldo-valor'),
  receitas: document.getElementById('receitas-valor'),
  despesas: document.getElementById('despesas-valor'),
  lista: document.getElementById('lista'),
  listaVazia: document.getElementById('lista-vazia'),
  graficoVazio: document.getElementById('grafico-vazio'),
  modal: document.getElementById('modal'),
  modalTitulo: document.getElementById('modal-titulo'),
  orcamentos: document.getElementById('orcamentos'),
  orcamentosVazio: document.getElementById('orcamentos-vazio'),
  modalOrcamento: document.getElementById('modal-orcamento'),
  modalOrcamentoTitulo: document.getElementById('modal-orcamento-titulo'),
  formOrcamento: document.getElementById('form-orcamento'),
  formOrcamentoErro: document.getElementById('form-orcamento-erro'),
  formOrcamentoCategoria: document.getElementById('form-orcamento-categoria'),
  formOrcamentoLimite: document.getElementById('form-orcamento-limite'),
  form: document.getElementById('form'),
  formErro: document.getElementById('form-erro'),
  descricao: document.getElementById('form-descricao'),
  valor: document.getElementById('form-valor'),
  tipo: document.getElementById('form-tipo'),
  categoria: document.getElementById('form-categoria'),
  data: document.getElementById('form-data'),
};

let grafico;

// mês no formato yyyy-mm, que é o que a API espera
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// o banco guarda "2026-09-17", eu mostro como 17/09/2026
function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

// wrapper do fetch: joga erro com a mensagem que a API devolveu, se existir
async function api(url, opcoes = {}) {
  const res = await fetch(url, opcoes);
  const dados = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((dados && dados.error) || 'Algo deu errado. Tente novamente.');
  return dados;
}

function montarQuery() {
  const params = new URLSearchParams({ month: state.mes });
  if (state.categoria) params.set('category', state.categoria);
  return params.toString();
}

function preencherMeses() {
  const agora = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rotulo = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    el.filtroMes.add(new Option(rotulo, valor));
  }
  el.filtroMes.value = state.mes;
}

function preencherCategorias() {
  for (const categoria of CATEGORIAS) {
    el.filtroCategoria.add(new Option(categoria, categoria));
    el.categoria.add(new Option(capitalizar(categoria), categoria));
  }
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function configurarGrafico() {
  grafico = new Chart(document.getElementById('grafico'), {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{ data: [], backgroundColor: [] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Roboto', size: 13 }, usePointStyle: true, padding: 14 },
        },
      },
    },
  });
}

function configurarEventos() {
  el.filtroMes.addEventListener('change', () => {
    state.mes = el.filtroMes.value;
    atualizarTudo();
  });

  el.filtroCategoria.addEventListener('change', () => {
    state.categoria = el.filtroCategoria.value;
    atualizarTudo();
  });

  document.getElementById('btn-nova').addEventListener('click', () => abrirModal());
  document.getElementById('btn-orcamento').addEventListener('click', () => abrirModalOrcamento());
  document.getElementById('modal-fechar').addEventListener('click', fecharModal);
  document.getElementById('modal-cancelar').addEventListener('click', fecharModal);
  document.getElementById('modal-orcamento-fechar').addEventListener('click', fecharModalOrcamento);
  document.getElementById('modal-orcamento-cancelar').addEventListener('click', fecharModalOrcamento);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) fecharModal();
  });
  el.modalOrcamento.addEventListener('click', (e) => {
    if (e.target === el.modalOrcamento) fecharModalOrcamento();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharModal();
      fecharModalOrcamento();
    }
  });

  el.form.addEventListener('submit', salvarTransacao);
  el.formOrcamento.addEventListener('submit', salvarOrcamento);
}

async function carregarSummary() {
  return api(`/api/summary?${montarQuery()}`);
}

async function carregarOrcamentos() {
  return api(`/api/budgets?month=${state.mes}`);
}

async function carregarTransacoes() {
  return api(`/api/transactions?${montarQuery()}`);
}

async function atualizarTudo() {
  try {
    const [summary, transacoes, orcamentos] = await Promise.all([
      carregarSummary(),
      carregarTransacoes(),
      carregarOrcamentos(),
    ]);
    renderizarSummary(summary);
    renderizarLista(transacoes);
    renderizarGrafico(transacoes);
    renderizarOrcamentos(orcamentos);
  } catch (err) {
    alert(err.message);
  }
}

function renderizarSummary(summary) {
  el.saldo.textContent = moeda.format(summary.saldo);
  el.saldo.classList.toggle('negativo', summary.saldo < 0);
  el.receitas.textContent = moeda.format(summary.receitas);
  el.despesas.textContent = moeda.format(summary.despesas);
}

function renderizarLista(transacoes) {
  el.lista.innerHTML = '';
  el.listaVazia.hidden = transacoes.length > 0;

  for (const t of transacoes) {
    el.lista.appendChild(criarItem(t));
  }
}

function criarItem(t) {
  const li = document.createElement('li');
  li.className = 'transacao';

  const info = document.createElement('div');
  info.className = 'transacao__info';

  const descricao = document.createElement('span');
  descricao.className = 'transacao__descricao';
  descricao.textContent = t.descricao;
  descricao.title = t.descricao;

  const meta = document.createElement('span');
  meta.className = 'transacao__meta';

  const cor = CORES[t.categoria] || '#94a3b8';
  const chip = document.createElement('span');
  chip.className = 'transacao__categoria';
  chip.textContent = t.categoria;
  chip.style.color = cor;
  chip.style.background = cor + '1a'; // hex + alpha = fundo suave da mesma cor

  meta.append(chip, document.createTextNode(formatarData(t.data)));
  info.append(descricao, meta);

  const valor = document.createElement('span');
  valor.className = `transacao__valor transacao__valor--${t.tipo}`;
  valor.textContent = `${t.tipo === 'despesa' ? '-' : '+'}${moeda.format(t.valor)}`;

  const acoes = document.createElement('div');
  acoes.className = 'transacao__acoes';

  const btnEditar = botaoIcone(iconeLapis(), 'Editar');
  btnEditar.addEventListener('click', () => abrirModal(t));

  const btnExcluir = botaoIcone(iconeLixeira(), 'Excluir');
  btnExcluir.addEventListener('click', () => excluirTransacao(t.id));

  acoes.append(btnEditar, btnExcluir);
  li.append(info, valor, acoes);
  return li;
}

function botaoIcone(svg, titulo) {
  const btn = document.createElement('button');
  btn.className = 'btn-icon';
  btn.type = 'button';
  btn.title = titulo;
  btn.innerHTML = svg;
  return btn;
}

function iconeLapis() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>`;
}

function iconeLixeira() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>`;
}

function renderizarGrafico(transacoes) {
  // soma as despesas por categoria pro gráfico de pizza
  const totais = new Map();
  for (const t of transacoes) {
    if (t.tipo !== 'despesa') continue;
    totais.set(t.categoria, (totais.get(t.categoria) || 0) + t.valor);
  }

  const categorias = [...totais.keys()];
  grafico.data.labels = categorias;
  grafico.data.datasets[0].data = [...totais.values()];
  grafico.data.datasets[0].backgroundColor = categorias.map((c) => CORES[c] || '#94a3b8');
  grafico.update();

  document.getElementById('grafico').hidden = categorias.length === 0;
  el.graficoVazio.hidden = categorias.length > 0;
}

// barra de progresso do orçamento muda de cor conforme o gasto se aproxima do limite
function corBarra(orcamento) {
  if (orcamento.estourado) return 'estourado';
  if (orcamento.gasto >= orcamento.limite * 0.8) return 'alerta';
  return '';
}

function renderizarOrcamentos(orcamentos) {
  orcamentosAtuais = orcamentos;
  el.orcamentos.innerHTML = '';
  el.orcamentosVazio.hidden = orcamentos.length > 0;

  for (const o of orcamentos) {
    el.orcamentos.appendChild(criarItemOrcamento(o));
  }
}

function criarItemOrcamento(o) {
  const li = document.createElement('li');
  li.className = 'orcamento';

  const topo = document.createElement('div');
  topo.className = 'orcamento__topo';

  const categoria = document.createElement('span');
  categoria.className = 'orcamento__categoria';
  categoria.textContent = capitalizar(o.categoria);

  const valores = document.createElement('span');
  valores.className = 'orcamento__valores';
  if (o.estourado) {
    const aviso = document.createElement('strong');
    aviso.className = 'estourado';
    aviso.textContent = `⚠ estourou ${moeda.format(o.gasto - o.limite)} — `;
    valores.append(aviso, document.createTextNode(`${moeda.format(o.gasto)} de ${moeda.format(o.limite)}`));
  } else {
    const resta = document.createElement('strong');
    resta.textContent = `${moeda.format(o.restante)} restantes`;
    valores.append(resta, document.createTextNode(` de ${moeda.format(o.limite)}`));
  }

  topo.append(categoria, valores);

  const barra = document.createElement('div');
  barra.className = 'orcamento__barra';

  const preenchimento = document.createElement('div');
  preenchimento.className = `orcamento__preenchimento ${corBarra(o)}`.trim();
  // deixo a barra passar de 100% quando estoura, mas sem sumir com o layout
  preenchimento.style.width = `${Math.min((o.gasto / o.limite) * 100, 100)}%`;

  barra.appendChild(preenchimento);

  const acoes = document.createElement('div');
  acoes.className = 'orcamento__acoes';

  const btnEditar = botaoIcone(iconeLapis(), 'Editar limite');
  btnEditar.addEventListener('click', () => abrirModalOrcamento(o.categoria));

  const btnExcluir = botaoIcone(iconeLixeira(), 'Remover orçamento');
  btnExcluir.addEventListener('click', () => excluirOrcamento(o.categoria));

  acoes.append(btnEditar, btnExcluir);
  li.append(topo, barra, acoes);
  return li;
}

function preencherCategoriasOrcamento() {
  for (const categoria of CATEGORIAS) {
    el.formOrcamentoCategoria.add(new Option(capitalizar(categoria), categoria));
  }
}

function abrirModalOrcamento(categoria) {
  el.formOrcamentoErro.hidden = true;
  el.formOrcamento.reset();

  const existente = orcamentosAtuais.find((o) => o.categoria === categoria);
  el.modalOrcamentoTitulo.textContent = existente || categoria ? 'Editar orçamento' : 'Definir orçamento';
  el.formOrcamentoCategoria.value = categoria || CATEGORIAS[0];
  if (existente) el.formOrcamentoLimite.value = existente.limite;

  el.modalOrcamento.classList.add('aberto');
  el.formOrcamentoLimite.focus();
}

function fecharModalOrcamento() {
  el.modalOrcamento.classList.remove('aberto');
}

async function salvarOrcamento(e) {
  e.preventDefault();
  const categoria = el.formOrcamentoCategoria.value;
  const limite = Number(el.formOrcamentoLimite.value);

  if (!Number.isFinite(limite) || limite <= 0) {
    el.formOrcamentoErro.textContent = 'O limite deve ser maior que zero.';
    el.formOrcamentoErro.hidden = false;
    return;
  }

  try {
    await api('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, limite }),
    });
    fecharModalOrcamento();
    await atualizarTudo();
  } catch (err) {
    el.formOrcamentoErro.textContent = err.message;
    el.formOrcamentoErro.hidden = false;
  }
}

async function excluirOrcamento(categoria) {
  if (!confirm(`Remover o orçamento de ${categoria}?`)) return;
  try {
    await api(`/api/budgets/${encodeURIComponent(categoria)}`, { method: 'DELETE' });
    await atualizarTudo();
  } catch (err) {
    alert(err.message);
  }
}

function abrirModal(transacao) {
  state.editandoId = transacao ? transacao.id : null;
  el.modalTitulo.textContent = transacao ? 'Editar transação' : 'Nova transação';
  el.formErro.hidden = true;
  el.form.reset();

  el.descricao.value = transacao ? transacao.descricao : '';
  el.valor.value = transacao ? transacao.valor : '';
  el.tipo.value = transacao ? transacao.tipo : 'despesa';
  el.categoria.value = transacao ? transacao.categoria : CATEGORIAS[0];
  el.data.value = transacao ? transacao.data : hoje();

  el.modal.classList.add('aberto');
  el.descricao.focus();
}

function fecharModal() {
  el.modal.classList.remove('aberto');
}

function lerFormulario() {
  return {
    descricao: el.descricao.value.trim(),
    valor: Number(el.valor.value),
    tipo: el.tipo.value,
    categoria: el.categoria.value,
    data: el.data.value,
  };
}

function validar({ descricao, valor, data }) {
  if (!descricao) return 'Informe a descrição.';
  if (!Number.isFinite(valor) || valor <= 0) return 'O valor deve ser maior que zero.';
  if (!data) return 'Informe a data.';
  return null;
}

function mostrarErro(msg) {
  el.formErro.textContent = msg;
  el.formErro.hidden = false;
}

async function salvarTransacao(e) {
  e.preventDefault();
  const dados = lerFormulario();
  const erro = validar(dados);
  if (erro) return mostrarErro(erro);

  try {
    const url = state.editandoId ? `/api/transactions/${state.editandoId}` : '/api/transactions';
    await api(url, {
      method: state.editandoId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    fecharModal();
    await atualizarTudo();
  } catch (err) {
    mostrarErro(err.message);
  }
}

async function excluirTransacao(id) {
  if (!confirm('Excluir esta transação?')) return;
  try {
    await api(`/api/transactions/${id}`, { method: 'DELETE' });
    await atualizarTudo();
  } catch (err) {
    alert(err.message);
  }
}

function init() {
  preencherMeses();
  preencherCategorias();
  preencherCategoriasOrcamento();
  configurarGrafico();
  configurarEventos();
  atualizarTudo();
}

init();
