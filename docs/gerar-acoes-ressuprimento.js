/**
 * Gera CSV de ações de ressuprimento a partir do backup local.
 *
 * Como rodar: node docs/gerar-acoes-ressuprimento.js
 * Saída: docs/acoes-ressuprimento.csv
 *
 * Regras (alinhadas com o user):
 * - 1 ação por DIA com ressuprimento
 * - Agrupar SKUs por qtd de paletes; repetir o verbo "Ressuprir N palete(s)"
 *   pra cada grupo na mesma frase. Concluir com "devido a falta durante carregamento."
 * - Listar TODOS os conferentes únicos do dia na conclusão
 * - Sorteio aleatório entre Carlos Alexandre / Denis na conclusão
 */

const fs = require('fs');
const path = require('path');

const DIR_BACKUP = path.join(__dirname, '..', 'backup-2026-05-19', 'abastecimentos');
const OUT_FILE   = path.join(__dirname, 'acoes-ressuprimento.csv');
const VALIDADORES = ['Carlos Alexandre', 'Denis'];

// ─── Helpers ──────────────────────────────────────────────────────────────
function escapeCSV(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function listarComE(itens) {
  if (itens.length === 0) return '';
  if (itens.length === 1) return itens[0];
  if (itens.length === 2) return `${itens[0]} e ${itens[1]}`;
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function pluralPalete(n) {
  return n === 1 ? 'palete' : 'paletes';
}

function sortearValidador() {
  return VALIDADORES[Math.floor(Math.random() * VALIDADORES.length)];
}

// ─── Lê backup ────────────────────────────────────────────────────────────
const arquivos = fs.readdirSync(DIR_BACKUP).filter(f => f.endsWith('.json'));

const porDia = {}; // { 'DD/MM/AAAA': [registros] }
arquivos.forEach(arq => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR_BACKUP, arq), 'utf8'));
  if (d.tipo !== 'ressuprimento') return;
  const dia = d.dataOperacional;
  if (!dia) return;
  if (!porDia[dia]) porDia[dia] = [];
  porDia[dia].push(d);
});

// Ordena dias cronologicamente
const dias = Object.keys(porDia).sort((a, b) => {
  const [da, ma, ya] = a.split('/');
  const [db, mb, yb] = b.split('/');
  return (ya + ma + da).localeCompare(yb + mb + db);
});

// ─── Gera linhas do CSV ───────────────────────────────────────────────────
const saida = [];
saida.push('Reunião;Ação;Indicador;Dono;Responsável;Início;Fim;Conclusão');

dias.forEach(dia => {
  const registros = porDia[dia];

  // Agrupa por qtdPaletes
  const porQtd = {}; // { 1: ['cod1', 'cod2'], 2: ['cod3'] }
  registros.forEach(r => {
    const qtd = Number(r.qtdPaletes) || 0;
    if (qtd === 0) return;
    if (!porQtd[qtd]) porQtd[qtd] = [];
    porQtd[qtd].push(String(r.codProduto));
  });

  // Monta fragmentos ordenados crescentemente por qtd
  const qtds = Object.keys(porQtd).map(n => parseInt(n, 10)).sort((a, b) => a - b);
  const fragmentos = qtds.map(qtd => {
    const codigos = porQtd[qtd];
    return `Ressuprir ${qtd} ${pluralPalete(qtd)} dos SKUs ${codigos.join(', ')}`;
  });

  // Texto final: concatena com ". " e finaliza com a causa
  const texto = `${fragmentos.join('. ')}, devido a falta durante carregamento.`;

  // Conferentes únicos do dia
  const conferentesUnicos = Array.from(new Set(
    registros.map(r => String(r.conferente || '').trim()).filter(Boolean)
  ));
  const isPlural = conferentesUnicos.length > 1;
  const lblConferente = isPlural ? 'pelos conferentes' : 'pelo conferente';
  const conclusao = `Ressuprimento realizado por ${sortearValidador()}, validado `
    + `${lblConferente} ${listarComE(conferentesUnicos)}.`;

  saida.push([
    'RPS',
    escapeCSV(texto),
    'Ressuprimento',
    'Lais',
    'Dennyson',
    dia,
    dia,
    escapeCSV(conclusao),
  ].join(';'));
});

// ─── Salva CSV (com BOM pra Excel abrir UTF-8 certinho) ───────────────────
fs.writeFileSync(OUT_FILE, '﻿' + saida.join('\r\n'), 'utf8');

console.log(`✅ ${dias.length} ações geradas em ${OUT_FILE}`);
console.log(`   Período: ${dias[0]} a ${dias[dias.length - 1]}`);

// Mostra primeiras 3 linhas pra preview rápido
console.log('\n📋 Preview (primeiras 3 ações):\n');
saida.slice(1, 4).forEach((linha, i) => {
  const cols = linha.split(';');
  console.log(`#${i + 1} ${dias[i]}`);
  console.log(`  Ação:      ${cols[1].replace(/^"|"$/g, '')}`);
  console.log(`  Conclusão: ${cols[7].replace(/^"|"$/g, '')}\n`);
});
