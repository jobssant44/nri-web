/**
 * Migra Coletas de Validade que foram gravadas em `coletas_validade` (mobile
 * antigo, antes da separação de coleções) para `inventory_logs`.
 *
 * Os campos já são compatíveis (o mobile gravava o mesmo objeto, só na
 * coleção errada). O ID do doc é preservado.
 *
 * Modos:
 *   node scripts/migrar-coletas-validade.js              # dry-run (só conta)
 *   node scripts/migrar-coletas-validade.js --execute    # executa de verdade
 */
const admin = require('firebase-admin');
const path  = require('path');

const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');
let sa;
try { sa = require(KEY_PATH); }
catch { console.error(`❌ Não achei ${KEY_PATH}. Coloque o service-account-key.json na raiz do nri-web.`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');
const BATCH_SIZE = 100;

async function main() {
  console.log(`\n🔍 ${EXECUTE ? 'MIGRANDO' : '[dry-run]'} coletas_validade → inventory_logs\n`);

  const empresasSnap = await db.collection('empresas').get();
  console.log(`Encontradas ${empresasSnap.size} empresa(s).\n`);

  let totalEncontrado = 0;
  let totalMigrado    = 0;

  for (const empresaDoc of empresasSnap.docs) {
    const empId = empresaDoc.id;
    const colSrc = db.collection('empresas').doc(empId).collection('coletas_validade');
    const colDst = db.collection('empresas').doc(empId).collection('inventory_logs');

    const snap = await colSrc.get();
    if (snap.empty) {
      console.log(`  empresa "${empId}": 0 docs.`);
      continue;
    }
    totalEncontrado += snap.size;
    console.log(`  empresa "${empId}": ${snap.size} doc(s) pra migrar.`);

    if (!EXECUTE) continue;

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
    console.log(`   node scripts/migrar-coletas-validade.js --execute\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Erro:', err); process.exit(1); });
