/**
 * Simulação READ-ONLY dos lançamentos retroativos de reabastecimento e
 * ressuprimento para o dia 21/05/2026.
 *
 * Lê: empresas, picking_config_mensal, vendas_relatorio, produtos, abastecimentos.
 * NÃO grava nada — só imprime no console o que seria inserido se rodássemos
 * o lançamento retroativo.
 *
 * Como rodar: node docs/simular-lancamentos-21-05.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Init ────────────────────────────────────────────────────────────────────
const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error('❌ service-account-key.json não encontrado na raiz do projeto.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ── Helpers de data ─────────────────────────────────────────────────────────
function parsearData(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}
function formatarData(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function diasDoMes(ano, mes) {
  const dias = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    dias.push(formatarData(new Date(d)));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

// ── Simulação do picking (porta da lógica do PlanificadorIV) ───────────────
function simularPicking({
  diasMes, vendasPorDia, reabRealPorDia, ressupRealPorDia,
  cxPorPlt, espacosPalete, saldoInicial, modo, dataLimitePassado,
}) {
  const capacidade = espacosPalete * cxPorPlt;
  let saldo = saldoInicial;
  let accPaletes = 0;
  const porDia = {};
  const limite = dataLimitePassado || new Date();

  for (const dateStr of diasMes) {
    const d = parsearData(dateStr);
    if (!d) continue;
    const isFuture = d > limite;
    const isDom = d.getDay() === 0;

    if (isFuture) {
      porDia[dateStr] = { isFuture: true, isDom, saldoFimDia: saldo, reabPlanejado: null, ressupNecessario: null };
      continue;
    }
    if (isDom) {
      if (modo === 'simular_passado') {
        const ressupReal = ressupRealPorDia?.[dateStr] || 0;
        if (ressupReal > 0) saldo = Math.min(capacidade, saldo + ressupReal * cxPorPlt);
      }
      porDia[dateStr] = { isFuture: false, isDom: true, saldoFimDia: saldo, reabPlanejado: null, ressupNecessario: null };
      continue;
    }

    const ref = new Date(d);
    ref.setDate(ref.getDate() - (d.getDay() === 1 ? 2 : 1));
    const dataRef = formatarData(ref);
    let vendasOntem = vendasPorDia?.[dataRef] ?? null;
    if (vendasOntem === null && ref.getDay() === 1) vendasOntem = 0;

    let reabAplicado = 0;
    if (modo === 'simular_passado') {
      reabAplicado = reabRealPorDia?.[dateStr] || 0;
    } else {
      if (vendasOntem !== null && cxPorPlt > 0) accPaletes += vendasOntem / cxPorPlt;
      if (accPaletes >= 1 && cxPorPlt > 0) {
        const espacoLivre = Math.max(0, capacidade - saldo);
        const maxPorEspaco = Math.floor(espacoLivre / cxPorPlt);
        const maxPorConfig = espacosPalete > 0 ? espacosPalete : Infinity;
        reabAplicado = Math.min(Math.floor(accPaletes), maxPorEspaco, maxPorConfig);
        accPaletes -= reabAplicado;
      }
    }
    saldo = Math.min(capacidade, saldo + reabAplicado * cxPorPlt);

    const vendasHoje = vendasPorDia?.[dateStr] ?? null;
    if (vendasHoje !== null) saldo -= vendasHoje;

    let ressupAplicado = 0;
    if (modo === 'simular_passado') {
      ressupAplicado = ressupRealPorDia?.[dateStr] || 0;
      saldo += ressupAplicado * cxPorPlt;
      saldo = Math.max(saldo, 0);
    } else if (cxPorPlt > 0 && saldo < 0) {
      ressupAplicado = Math.ceil(-saldo / cxPorPlt);
      saldo += ressupAplicado * cxPorPlt;
      accPaletes = Math.max(0, accPaletes - ressupAplicado);
    }

    porDia[dateStr] = {
      reabPlanejado: modo === 'planejar' ? reabAplicado : null,
      ressupNecessario: modo === 'planejar' ? ressupAplicado : null,
      vendasOntem, vendasHoje, dataRef, saldoFimDia: saldo,
    };
  }
  return { saldoFinalMes: saldo, porDia };
}

// ── Run ─────────────────────────────────────────────────────────────────────
(async () => {
  const DATA_ALVO = '21/05/2026';
  const ANO_ALVO  = 2026;
  const MES_ALVO  = 5;
  const CHAVE_MES = '2026-05';

  console.log(`\n🔎 Simulando lançamentos para ${DATA_ALVO} (read-only)\n`);

  // 1. Empresa CBB (operação real)
  const empresaId = 'O1yV3DfTJotha9cE4gFJ';
  const empresaRef = db.collection('empresas').doc(empresaId);
  const empData = (await empresaRef.get()).data() || {};
  console.log(`Empresa: ${empData.nome || empresaId}\n`);

  // 2. picking_config_mensal
  let pickingSnap = await empresaRef.collection('picking_config_mensal').doc(CHAVE_MES).get();
  let pickingConfig;
  if (pickingSnap.exists && Array.isArray(pickingSnap.data().produtos)) {
    pickingConfig = pickingSnap.data().produtos;
  } else {
    // Fallback: picking_config (legado)
    const legSnap = await empresaRef.collection('picking_config').get();
    pickingConfig = legSnap.docs.map(d => d.data());
  }
  console.log(`Picking config: ${pickingConfig.length} SKUs`);

  // 3. produtos (cxPorPlt)
  const prodSnap = await empresaRef.collection('produtos').get();
  const cxPorPltMap = {};
  prodSnap.docs.forEach(d => {
    const x = d.data();
    if (x.codigo && x.paletizacao) cxPorPltMap[String(x.codigo)] = Number(x.paletizacao);
  });
  console.log(`Produtos com paletização: ${Object.keys(cxPorPltMap).length}`);

  // 4. vendas_relatorio do mês — pega todos os docs e merge (mais recente por produto/data)
  const vendasSnap = await empresaRef.collection('vendas_relatorio').get();
  const vendasMap = {};  // { codigo: { 'DD/MM/AAAA': qtdCx } }
  vendasSnap.docs.forEach(d => {
    const data = d.data();
    if (!Array.isArray(data.produtos)) return;
    data.produtos.forEach(p => {
      const cod = String(p.codigo);
      if (!vendasMap[cod]) vendasMap[cod] = {};
      if (p.vendas && typeof p.vendas === 'object') {
        Object.entries(p.vendas).forEach(([dt, qtd]) => {
          vendasMap[cod][dt] = qtd;
        });
      }
    });
  });
  console.log(`Produtos com vendas no mapa: ${Object.keys(vendasMap).length}`);

  // 5. abastecimentos do mês (reais)
  const abastSnap = await empresaRef.collection('abastecimentos').get();
  const reabMap = {};   // { codigo: { 'DD/MM/AAAA': paletes } }
  const ressupMap = {}; // { codigo: { 'DD/MM/AAAA': paletes } }
  abastSnap.docs.forEach(d => {
    const a = d.data();
    const cod = String(a.codProduto);
    const target = a.tipo === 'reabastecimento' ? reabMap : ressupMap;
    if (!target[cod]) target[cod] = {};
    target[cod][a.dataOperacional] = (target[cod][a.dataOperacional] || 0) + (a.qtdPaletes || 0);
  });
  console.log(`Lançamentos no mês: ${abastSnap.size} (reab + ressup)\n`);

  // 6. Verifica quem já tem lançamento real no dia 21/05/2026
  const jaTemReab = new Set();
  const jaTemRessup = new Set();
  abastSnap.docs.forEach(d => {
    const a = d.data();
    if (a.dataOperacional !== DATA_ALVO) return;
    const cod = String(a.codProduto);
    if (a.tipo === 'reabastecimento') jaTemReab.add(cod);
    if (a.tipo === 'ressuprimento')   jaTemRessup.add(cod);
  });
  console.log(`Já lançado em ${DATA_ALVO}: ${jaTemReab.size} reabs e ${jaTemRessup.size} ressups (serão pulados).\n`);

  // 7. Simula cada produto e descobre o que seria lançado no dia 21/05
  const dias = diasDoMes(ANO_ALVO, MES_ALVO);
  const dataLimite = parsearData(DATA_ALVO); // simular até 21/05 (não além)

  const reabsParaInserir = [];
  const ressupsParaInserir = [];

  for (const cfg of pickingConfig) {
    const cod = String(cfg.codProduto);
    const cxPorPlt = cxPorPltMap[cod] || cfg.cxPorPlt || 0;
    const espacosPalete = cfg.espacosPalete || 0;
    if (cxPorPlt <= 0 || espacosPalete <= 0) continue;

    const vendasPorDia = vendasMap[cod] || {};
    const reabRealPorDia = reabMap[cod] || {};
    const ressupRealPorDia = ressupMap[cod] || {};

    // 7a. saldo inicial do mês = capacidade (assumimos picking cheio no início)
    const saldoInicial = espacosPalete * cxPorPlt;

    // 7b. Reconstrói o saldo até o dia 20/05 com dados reais
    const sim20 = simularPicking({
      diasMes: dias,
      vendasPorDia,
      reabRealPorDia,
      ressupRealPorDia,
      cxPorPlt,
      espacosPalete,
      saldoInicial,
      modo: 'simular_passado',
      dataLimitePassado: new Date(2026, 4, 20), // dia 20/05
    });

    // 7c. Pega o saldo no fim do dia 20 (entrada do dia 21)
    const saldoFimDia20 = sim20.porDia['20/05/2026']?.saldoFimDia ?? saldoInicial;

    // 7d. Simula só o dia 21 em modo 'planejar' usando esse saldo como inicial
    const sim21 = simularPicking({
      diasMes: ['21/05/2026'],
      vendasPorDia,
      reabRealPorDia,
      ressupRealPorDia,
      cxPorPlt,
      espacosPalete,
      saldoInicial: saldoFimDia20,
      modo: 'planejar',
      dataLimitePassado: new Date(2026, 4, 21),
    });
    const dia21 = sim21.porDia['21/05/2026'];
    if (!dia21) continue;

    const planejado = dia21.reabPlanejado || 0;
    const ressup    = dia21.ressupNecessario || 0;

    if (planejado >= 1 && !jaTemReab.has(cod)) {
      reabsParaInserir.push({
        codigo: cod,
        nome:   cfg.nomeProduto || '',
        paletes: planejado,
        vendasOntem: dia21.vendasOntem,
      });
    }
    if (ressup >= 1 && !jaTemRessup.has(cod)) {
      ressupsParaInserir.push({
        codigo: cod,
        nome:   cfg.nomeProduto || '',
        paletes: ressup,
        vendasHoje: dia21.vendasHoje,
      });
    }
  }

  // 8. Imprime a lista
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  PROPOSTA DE LANÇAMENTOS PARA ${DATA_ALVO}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📦 REABASTECIMENTOS (${reabsParaInserir.length}):\n`);
  reabsParaInserir
    .sort((a, b) => b.paletes - a.paletes)
    .forEach(r => {
      const v = r.vendasOntem != null ? `vendas 20/05 = ${r.vendasOntem} cx` : '(sem dado de vendas)';
      console.log(`  ${String(r.codigo).padEnd(8)}  ${String(r.paletes).padStart(2)} plt   ${r.nome.padEnd(50).slice(0, 50)}  · ${v}`);
    });

  const totalReab = reabsParaInserir.reduce((s, r) => s + r.paletes, 0);
  console.log(`\n  Total: ${totalReab} paletes em ${reabsParaInserir.length} SKUs`);

  console.log(`\n🚨 RESSUPRIMENTOS (${ressupsParaInserir.length}):\n`);
  if (ressupsParaInserir.length === 0) {
    console.log('  (Nenhum ressuprimento necessário no dia 21/05/2026 segundo a simulação.)');
  } else {
    ressupsParaInserir
      .sort((a, b) => b.paletes - a.paletes)
      .forEach(r => {
        const v = r.vendasHoje != null ? `vendas 21/05 = ${r.vendasHoje} cx` : '(sem dado de vendas)';
        console.log(`  ${String(r.codigo).padEnd(8)}  ${String(r.paletes).padStart(2)} plt   ${r.nome.padEnd(50).slice(0, 50)}  · ${v}`);
      });
    const totalRessup = ressupsParaInserir.reduce((s, r) => s + r.paletes, 0);
    console.log(`\n  Total: ${totalRessup} paletes em ${ressupsParaInserir.length} SKUs`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Nada foi gravado. Confirme pra eu criar o script de inserção.');
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(0);
})().catch(e => { console.error('Erro:', e); process.exit(1); });
