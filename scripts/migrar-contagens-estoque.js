/**
 * Migra Contagens de Estoque que foram gravadas em `inventory_logs` ANTES da
 * separação de coleções para a nova coleção `contagens_estoque`.
 *
 * Critério: docs com `origem in ['manual-web-estoque', 'manual-mobile-estoque']`.
 *
 * Conecta no Firestore real (produção) via service-account-key.json — então
 * o script SÓ deve ser rodado quando você quer mexer em produção de verdade.
 *
 * Modos:
 *   node scripts/migrar-contagens-estoque.js              # dry-run (só conta)
 *   node scripts/migrar-contagens-estoque.js --execute    # executa de verdade
 *
 * Em modo execute, pra cada doc:
 *   1. Copia pra `contagens_estoque/{empresaId}/...` (mantém o mesmo doc ID)
 *   2. Deleta o original de `inventory_logs`
 *
 * Atravessa TODAS as empresas (sub-coleções de /empresas/{id}/inventory_logs).
 *
 * Batches de 100 por commit (Firestore aguenta 500, mas 100 dá margem).
 */
const admin = require('firebase-admin');
const path  = require('path');

const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');
let sa;
try { sa = require(KEY_PATH); }
catch { console.error(`❌ Não achei ${KEY_PATH}. Coloque o service-account-key.json na raiz do nri-web.`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const ORIGENS_ESTOQUE = ['manual-web-estoque', 'manual-mobile-estoque'];
const EXECUTE = process.argv.includes('--execute');
const BATCH_SIZE = 100;

async function main() {
  console.log(`\n🔍 ${EXECUTE ? 'MIGRANDO' : '[dry-run]'} contagens de estoque misturadas em inventory_logs\n`);

  const empresasSnap = await db.collection('empresas').get();
  console.log(`Encontradas ${empresasSnap.size} empresa(s).\n`);

  let totalEncontrado = 0;
  let totalMigrado    = 0;

  for (const empresaDoc of empresasSnap.docs) {
    const empId = empresaDoc.id;
    const colSrc = db.collection('empresas').doc(empId).collection('inventory_logs');
    const colDst = db.collection('empresas').doc(empId).collection('contagens_estoque');

    // where('origem', 'in', [...]) — Firestore limita 'in' a 30 valores, ok aqui
    const snap = await colSrc.where('origem', 'in', ORIGENS_ESTOQUE).get();
    if (snap.empty) {
      console.log(`  empresa "${empId}": 0 docs.`);
      continue;
    }
    totalEncontrado += snap.size;
    console.log(`  empresa "${empId}": ${snap.size} doc(s) pra migrar.`);

    if (!EXECUTE) continue;

    // Em batches: copia pra contagens_estoque + deleta original
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const slice = snap.docs.slice(i, i + BATCH_SIZE);
      slice.forEach(d => {
        batch.set(colDst.doc(d.id), d.data());
        batch.delete(d.ref);
      });
      await batch.commit();
      totalMigrado += slice.length;
      process.stdout.write(`\r    migrados: ${totalMigrado}`);
    }
    console.log('');
  }

  console.log(`\n📊 RESUMO`);
  console.log(`   Encontrados: ${totalEncontrado}`);
  if (EXECUTE) {
    console.log(`   Migrados:    ${totalMigrado}`);
    console.log(`\n✅ Migração concluída.`);
  } else {
    console.log(`\n💡 Foi só um dry-run. Pra executar de verdade:`);
    console.log(`   node scripts/migrar-contagens-estoque.js --execute\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Erro:', err); process.exit(1); });
