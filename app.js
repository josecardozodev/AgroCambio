/* app.js - AgroCâmbio Web (Etapa 2 - Desenvolvimento)
   Roda 100% no navegador (client side), em JavaScript puro, sem frameworks
   e sem chave de acesso. Consome a AwesomeAPI Cotações via fetch() + async/await. */

"use strict";

/* ====================================================================
   1. CONFIGURAÇÃO
   ==================================================================== */
const API_BASE = "https://economia.awesomeapi.com.br/json";
const URL_COTACOES = API_BASE + "/last/USD-BRL,EUR-BRL,CNY-BRL"; // cotação atual
const URL_DOLAR = API_BASE + "/last/USD-BRL";                    // só o dólar (conversor)
const MOEDAS = ["USD", "EUR", "CNY"];
const TIMEOUT_MS = 10000;                  // desiste da requisição após 10 s
const ATUALIZACAO_AUTOMATICA_MS = 60000;   // atualiza as cotações a cada 60 s
const MSG_ERRO_COTACOES = "Não foi possível obter as cotações. Verifique sua conexão.";

// Estado guardado para continuar funcionando se a rede falhar
let ultimoDolar = null;            // última cotação de compra do USD conhecida
let cotacoesCarregadas = false;    // já exibimos alguma cotação com sucesso?
let pedidoHistorico = 0;           // evita que uma resposta antiga sobrescreva uma nova

// Formatadores de número no padrão brasileiro
const fmtTaxa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
const fmtPct = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero"
});
const fmtQtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

// Atalho para buscar elementos pelo id
const $ = (id) => document.getElementById(id);

/* ====================================================================
   2. FUNÇÕES DE APOIO
   ==================================================================== */

// Faz a requisição ao servidor externo e devolve o JSON.
// Lança um erro se a rede falhar, se der timeout ou se o HTTP não for 2xx.
async function buscarJSON(url) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(url, { signal: controle.signal }); // requisição ao servidor externo
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);
    return await resposta.json();                                   // converte a resposta JSON
  } finally {
    clearTimeout(timer);
  }
}

function mostrarAviso(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.hidden = false;
}

function limparAviso() {
  const el = $("aviso");
  el.textContent = "";
  el.hidden = true;
}

/* ====================================================================
   3. FUNÇÃO 1 - COTAÇÕES AO VIVO (USD, EUR, CNY)
   ==================================================================== */

// Extrai e valida os campos de uma moeda na resposta da API.
// Ex.: a chave da resposta para o dólar é "USDBRL".
function lerCotacao(dados, codigo) {
  const bruto = dados && dados[codigo + "BRL"];
  if (!bruto) throw new Error("Resposta sem dados de " + codigo);

  const bid = parseFloat(bruto.bid);              // cotação de compra
  const variacao = parseFloat(bruto.pctChange);   // variação do dia (%)
  const timestamp = Number(bruto.timestamp);      // momento da cotação (segundos)

  if (!Number.isFinite(bid) || !Number.isFinite(variacao)) {
    throw new Error("Dados inválidos para " + codigo);
  }
  return { codigo, bid, variacao, timestamp };
}

// Escreve a cotação e a variação do dia no cartão da moeda.
function mostrar(cotacao) {
  $(cotacao.codigo).textContent = "R$ " + fmtTaxa.format(cotacao.bid);

  const elVariacao = $("var-" + cotacao.codigo);
  const positiva = cotacao.variacao >= 0;
  // RN01: variação positiva em verde e negativa em vermelho (classes do CSS)
  elVariacao.className = "variacao " + (positiva ? "positiva" : "negativa");
  elVariacao.textContent = (positiva ? "▲ " : "▼ ") + fmtPct.format(cotacao.variacao) + "% no dia";
}

async function carregarCotacoes() {
  const botao = $("btnAtualizar");
  botao.disabled = true;

  try {
    const dados = await buscarJSON(URL_COTACOES);

    // Valida TUDO antes de mexer na tela (nada de atualização pela metade)
    const cotacoes = MOEDAS.map((codigo) => lerCotacao(dados, codigo));

    cotacoes.forEach(mostrar);
    ultimoDolar = cotacoes[0].bid;   // MOEDAS[0] é o USD
    cotacoesCarregadas = true;

    // Horário informado pela própria API
    const maisRecente = Math.max(...cotacoes.map((c) => c.timestamp).filter(Number.isFinite));
    $("atualizacao").textContent = Number.isFinite(maisRecente)
      ? "Cotação da API em: " + new Date(maisRecente * 1000).toLocaleString("pt-BR")
      : "Cotações atualizadas.";

    limparAviso();
  } catch (erro) {
    console.error("Erro ao carregar cotações:", erro);
    // Mantém a última cotação conhecida na tela, se houver (nunca uma tela quebrada)
    mostrarAviso(MSG_ERRO_COTACOES + (cotacoesCarregadas ? " Exibindo a última cotação conhecida." : ""));
    if (!cotacoesCarregadas) {
      $("atualizacao").textContent = "Cotações indisponíveis no momento.";
    }
  } finally {
    botao.disabled = false;
  }
}

/* ====================================================================
   4. FUNÇÃO 2 - CONVERSOR DE RECEITA (US$ -> R$)
   ==================================================================== */

function modoSelecionado() {
  return document.querySelector('input[name="modo"]:checked').value;
}

// Mostra os campos do modo escolhido ("total" ou "unitario")
function alternarModo() {
  const modo = modoSelecionado();
  $("campos-total").hidden = modo !== "total";
  $("campos-unitario").hidden = modo !== "unitario";
  exibirResultado("", false);
}

function exibirResultado(texto, erro) {
  const el = $("resultado");
  el.textContent = texto;
  el.classList.toggle("erro", erro);
  el.classList.remove("com-conteudo");
  if (texto) {
    void el.offsetWidth;                 // reinicia a animação de entrada
    el.classList.add("com-conteudo");
  }
}

const numeroValido = (n) => Number.isFinite(n) && n >= 0;

async function converterReceita(evento) {
  evento.preventDefault();

  const modo = modoSelecionado();
  let valorUSD;
  let detalhe = "";

  // 1) Lê e valida o que o usuário digitou
  if (modo === "total") {
    valorUSD = parseFloat($("valorUSD").value);
    if (!numeroValido(valorUSD)) {
      exibirResultado("Informe um valor válido.", true);
      return;
    }
  } else {
    const quantidade = parseFloat($("quantidade").value);
    const preco = parseFloat($("precoUnitario").value);
    if (!numeroValido(quantidade) || !numeroValido(preco)) {
      exibirResultado("Informe uma quantidade e um preço válidos.", true);
      return;
    }
    valorUSD = quantidade * preco;
    detalhe = fmtQtd.format(quantidade) + " × " + fmtDolar.format(preco) + " = " + fmtDolar.format(valorUSD) + "\n";
  }

  // 2) Busca a cotação atual do dólar
  const botao = $("btnConverter");
  botao.disabled = true;
  exibirResultado("Consultando a cotação...", false);

  let cotacao;
  let avisoCotacao = "";
  try {
    const dados = await buscarJSON(URL_DOLAR);
    cotacao = parseFloat(dados.USDBRL.bid);          // RN02: usa a cotação de compra
    if (!Number.isFinite(cotacao)) throw new Error("Cotação inválida");
    ultimoDolar = cotacao;
  } catch (erro) {
    console.error("Erro ao buscar cotação para conversão:", erro);
    if (ultimoDolar !== null) {
      // Sem rede, mas já existe uma cotação conhecida: usa e avisa o usuário
      cotacao = ultimoDolar;
      avisoCotacao = "\n(Sem conexão: usando a última cotação conhecida.)";
    } else {
      exibirResultado(MSG_ERRO_COTACOES, true);
      botao.disabled = false;
      return;
    }
  }

  // 3) Calcula (RN03: receita em reais = valor em US$ x cotação) e mostra
  const reais = valorUSD * cotacao;
  exibirResultado(
    detalhe +
    fmtDolar.format(valorUSD) + " = " + fmtReal.format(reais) +
    "\n(cotação R$ " + fmtTaxa.format(cotacao) + ")" +
    avisoCotacao,
    false
  );
  botao.disabled = false;
}

/* ====================================================================
   5. BÔNUS - GRÁFICO DO HISTÓRICO (endpoint /daily, últimos 7 dias)
   ==================================================================== */
const SVG_NS = "http://www.w3.org/2000/svg";

// Cria um elemento SVG já com seus atributos (e texto, se houver)
function criarSVG(tag, atributos, texto) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const nome in atributos) el.setAttribute(nome, atributos[nome]);
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function desenharGrafico(pontos, codigo) {
  const W = 640, H = 320;
  const esq = 70, dir = 24, topo = 28, base = 48;

  const valores = pontos.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const folga = (max - min) * 0.15 || max * 0.01 || 0.05;   // espaço extra em cima e embaixo
  const yMin = min - folga;
  const yMax = max + folga;

  const posX = (i) => pontos.length === 1
    ? (esq + W - dir) / 2
    : esq + i * (W - esq - dir) / (pontos.length - 1);
  const posY = (v) => topo + (yMax - v) * (H - topo - base) / (yMax - yMin);

  const svg = criarSVG("svg", {
    viewBox: "0 0 " + W + " " + H,
    role: "img",
    "aria-label": "Gráfico de linha da cotação de " + codigo + " nos últimos 7 dias"
  });
  const grupo = criarSVG("g", { class: "g-desenho" });
  svg.appendChild(grupo);

  // Linhas de grade e valores do eixo Y
  for (let i = 0; i <= 4; i++) {
    const valor = yMin + i * (yMax - yMin) / 4;
    const y = posY(valor);
    grupo.appendChild(criarSVG("line", { class: "g-grade", x1: esq, y1: y, x2: W - dir, y2: y }));
    grupo.appendChild(criarSVG("text", { class: "g-eixo", x: esq - 8, y: y + 4, "text-anchor": "end" }, fmtTaxa.format(valor)));
  }

  // Linha que liga os pontos
  const trajeto = pontos.map((p, i) => posX(i) + "," + posY(p.valor)).join(" ");
  grupo.appendChild(criarSVG("polyline", { class: "g-linha", points: trajeto }));

  // Pontos, valores e datas
  pontos.forEach((p, i) => {
    const x = posX(i);
    const y = posY(p.valor);
    const data = p.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

    const ponto = criarSVG("circle", { class: "g-ponto", cx: x, cy: y, r: 5 });
    ponto.appendChild(criarSVG("title", {}, data + ": R$ " + fmtTaxa.format(p.valor)));
    grupo.appendChild(ponto);

    grupo.appendChild(criarSVG("text", { class: "g-valor", x: x, y: y - 12, "text-anchor": "middle" }, fmtTaxa.format(p.valor)));
    grupo.appendChild(criarSVG("text", { class: "g-eixo", x: x, y: H - base + 22, "text-anchor": "middle" }, data));
  });

  $("grafico").replaceChildren(svg);

  // Resumo do período
  const primeiro = pontos[0].valor;
  const ultimo = pontos[pontos.length - 1].valor;
  const variacaoPeriodo = (ultimo - primeiro) / primeiro * 100;
  $("resumo-grafico").textContent =
    "Mínima: R$ " + fmtTaxa.format(min) +
    " · Máxima: R$ " + fmtTaxa.format(max) +
    " · Variação no período: " + fmtPct.format(variacaoPeriodo) + "%";
}

async function carregarHistorico() {
  const codigo = $("moedaGrafico").value;
  const aviso = $("avisoGrafico");
  const meuPedido = ++pedidoHistorico;

  try {
    const dados = await buscarJSON(API_BASE + "/daily/" + codigo + "-BRL/7");
    if (!Array.isArray(dados) || dados.length === 0) throw new Error("Histórico vazio");

    const pontos = dados
      .map((d) => ({ data: new Date(Number(d.timestamp) * 1000), valor: parseFloat(d.bid) }))
      .filter((p) => !isNaN(p.data.getTime()) && Number.isFinite(p.valor))
      .sort((a, b) => a.data - b.data);        // do mais antigo para o mais recente

    if (pontos.length === 0) throw new Error("Histórico sem dados válidos");

    if (meuPedido !== pedidoHistorico) return; // o usuário já pediu outra moeda
    desenharGrafico(pontos, codigo);
    aviso.hidden = true;
  } catch (erro) {
    console.error("Erro ao carregar histórico:", erro);
    if (meuPedido !== pedidoHistorico) return;
    $("grafico").replaceChildren();            // não deixa o gráfico de outra moeda na tela
    $("resumo-grafico").textContent = "";
    aviso.textContent = "Não foi possível obter o histórico. Verifique sua conexão.";
    aviso.hidden = false;
  }
}

/* ====================================================================
   6. INICIALIZAÇÃO E EVENTOS
   ==================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // Botão "Atualizar agora": recarrega cotações e histórico
  $("btnAtualizar").addEventListener("click", () => {
    carregarCotacoes();
    carregarHistorico();
  });

  // Conversor: envio do formulário (botão ou tecla Enter)
  $("formConversor").addEventListener("submit", converterReceita);
  document.querySelectorAll('input[name="modo"]').forEach((radio) => {
    radio.addEventListener("change", alternarModo);
  });

  // Gráfico: troca de moeda
  $("moedaGrafico").addEventListener("change", carregarHistorico);

  // Primeira carga e atualização automática
  carregarCotacoes();
  carregarHistorico();
  setInterval(carregarCotacoes, ATUALIZACAO_AUTOMATICA_MS);
});