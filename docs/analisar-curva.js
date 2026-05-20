/**
 * Analisa o CSV "Histórico Curva ABC AMBEV 2.0.csv" e gera o CSV de ações
 * de mudança de curva pra colar na planilha-mestre do plano de ação.
 *
 * Como rodar:
 *   node docs/analisar-curva.js
 *
 * Saída: imprime no console o CSV pronto pra copiar.
 */

const fs = require('fs');
const path = require('path');

// ─── Configuração ──────────────────────────────────────────────────────────
const CSV_IN = 'C:\\Users\\REVENDACBM\\Documents\\WJS\\WJS\\Arquivos WJS\\CBB\\Curva ABC\\Histórico Curva ABC AMBEV 2.0.csv';

// Datas por mês destino (1ª segunda-feira e a próxima segunda-feira)
const DATAS = {
  Jan: { ini: '05/01/2026', fim: '12/01/2026', nome: 'Jan/26', mesAnterior: 'Dez/25' },
  Fev: { ini: '02/02/2026', fim: '09/02/2026', nome: 'Fev/26', mesAnterior: 'Jan/26' },
  Mar: { ini: '02/03/2026', fim: '09/03/2026', nome: 'Mar/26', mesAnterior: 'Fev/26' },
  Abr: { ini: '06/04/2026', fim: '13/04/2026', nome: 'Abr/26', mesAnterior: 'Mar/26' },
  Mai: { ini: '04/05/2026', fim: '11/05/2026', nome: 'Mai/26', mesAnterior: 'Abr/26' },
};

const CONCLUSOES_SUBIU = [
  'Posições reanalisadas e paletes realocados para a área da nova curva. Sistema reparametrizado com as curvas atualizadas e equipe orientada sobre os novos endereços.',
  'Após análise, os SKUs foram movidos para a área da nova curva. Parametrização atualizada no sistema e conferentes informados da mudança.',
  'Realocação concluída para os produtos que ganharam giro. Sistema ajustado e operação alinhada sobre os endereços corretos.',
  'Acompanhamos a movimentação dos paletes para as áreas das novas curvas. Sistema reparametrizado e conferentes/operadores comunicados.',
  'Reanálise feita: paletes transferidos para a área da nova curva, parametrização do sistema atualizada e equipe avisada da mudança.',
];

const CONCLUSOES_DESCEU = [
  'Posições reanalisadas e paletes realocados para a área da nova curva. Sistema reparametrizado e equipe orientada sobre os novos endereços.',
  'Realocação concluída para os produtos com queda de giro. Sistema ajustado e operação alinhada sobre os endereços corretos.',
  'Após análise, os SKUs foram movidos para a área da nova curva. Parametrização atualizada no sistema e conferentes informados.',
  'Paletes movidos para a área da nova curva (menor giro). Parametrização do sistema atualizada e equipe comunicada.',
  'Reposicionamento concluído: produtos realocados nas áreas de menor giro. Sistema reparametrizado e operação informada.',
];

// ─── Parse do CSV ──────────────────────────────────────────────────────────
const conteudo = fs.readFileSync(CSV_IN, 'latin1'); // arquivo é Windows-1252
const linhas = conteudo.split(/\r?\n/).filter(l => l.trim());

// Cabeçalho: Posição;Código;Nome;Dez;Jan;Fev;Mar;Abr;Mai (índices 3-8)
const dados = linhas.slice(1).map(linha => {
  const cols = linha.split(';');
  return {
    codigo: String(cols[1] || '').trim(),
    nome:   String(cols[2] || '').trim(),
    dez:    String(cols[3] || '').trim().toUpperCase(),
    jan:    String(cols[4] || '').trim().toUpperCase(),
    fev:    String(cols[5] || '').trim().toUpperCase(),
    mar:    String(cols[6] || '').trim().toUpperCase(),
    abr:    String(cols[7] || '').trim().toUpperCase(),
    mai:    String(cols[8] || '').trim().toUpperCase(),
  };
}).filter(d => d.codigo);

// ─── Lógica de transição ──────────────────────────────────────────────────
function rank(curva) {
  if (curva === 'A') return 0;
  if (curva === 'B') return 1;
  if (curva === 'C') return 2;
  return null; // inválido
}

function comparar(antiga, nova) {
  const a = rank(antiga); const n = rank(nova);
  if (a == null || n == null) return null;
  if (a === n) return 'mantido';
  if (n < a) return 'subiu';   // melhor curva
  return 'desceu';              // pior curva
}

const transicoes = [
  { meta: 'Jan', anterior: 'dez', atual: 'jan' },
  { meta: 'Fev', anterior: 'jan', atual: 'fev' },
  { meta: 'Mar', anterior: 'fev', atual: 'mar' },
  { meta: 'Abr', anterior: 'mar', atual: 'abr' },
  { meta: 'Mai', anterior: 'abr', atual: 'mai' },
];

// ─── Geração das linhas do CSV ────────────────────────────────────────────
function escapeCSV(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function montarTexto(grupo, codigos, mesInfo) {
  const verbo = grupo === 'subiu' ? 'ganharam' : 'perderam';
  return `Reanalisar posicionamento de ${codigos.length} SKUs que ${verbo} giro em `
    + `${mesInfo.nome} (${mesInfo.mesAnterior}→${mesInfo.nome}): ${codigos.join(', ')}. `
    + `Mover paletes para a área da nova curva, atualizar a parametrização no sistema `
    + `e comunicar conferentes/operadores.`;
}

const saida = [];
saida.push('Reunião;Ação;Indicador;Dono;Responsável;Início;Fim;Conclusão');

let contCSubiu = 0, contCDesceu = 0;
const resumo = [];

transicoes.forEach(t => {
  const subiu = [];
  const desceu = [];
  dados.forEach(d => {
    const cmp = comparar(d[t.anterior], d[t.atual]);
    if (cmp === 'subiu')  subiu.push(d.codigo);
    if (cmp === 'desceu') desceu.push(d.codigo);
  });
  const mesInfo = DATAS[t.meta];
  resumo.push({ mes: t.meta, subiu: subiu.length, desceu: desceu.length });

  if (subiu.length > 0) {
    saida.push([
      'RPS',
      escapeCSV(montarTexto('subiu', subiu, mesInfo)),
      'Curva ABC',
      'Lais',
      'Dennyson',
      mesInfo.ini,
      mesInfo.fim,
      escapeCSV(CONCLUSOES_SUBIU[contCSubiu++ % CONCLUSOES_SUBIU.length]),
    ].join(';'));
  }
  if (desceu.length > 0) {
    saida.push([
      'RPS',
      escapeCSV(montarTexto('desceu', desceu, mesInfo)),
      'Curva ABC',
      'Lais',
      'Dennyson',
      mesInfo.ini,
      mesInfo.fim,
      escapeCSV(CONCLUSOES_DESCEU[contCDesceu++ % CONCLUSOES_DESCEU.length]),
    ].join(';'));
  }
});

// ─── Saída ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  RESUMO DAS TRANSIÇÕES');
console.log('═══════════════════════════════════════════════════════');
resumo.forEach(r => {
  console.log(`  ${r.mes}/26: ${r.subiu} subiram · ${r.desceu} desceram`);
});
console.log('═══════════════════════════════════════════════════════');
console.log('\nCSV (separador ; — pronto pra colar no Excel):\n');
console.log(saida.join('\n'));

// Salva em arquivo também
const outFile = path.join(__dirname, 'acoes-mudanca-curva.csv');
fs.writeFileSync(outFile, '﻿' + saida.join('\r\n'), 'utf8'); // BOM pra Excel
console.log(`\n\n✅ Salvo também em: ${outFile}`);
