/**
 * Reduz a base de produtos do emulator pra um subset configurável.
 *
 * Útil quando você importou 16k produtos no emulator mas quer um dataset
 * menor pra dev rápido (sem esperar paginação carregar 16 batches a cada login).
 *
 * NÃO MEXE EM PRODUÇÃO — só fala com o emulator local (FIRESTORE_EMULATOR_HOST).
 *
 * Uso:
 *   npm run reduzir-base                 # padrão: mantém 100 produtos
 *   npm run reduzir-base -- 50           # mantém 50 produtos
 *
 * Lógica: ordena por código (ID), mantém os N primeiros, deleta o resto.
 */
const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

admin.initializeApp({ projectId: 'app-nri-e0598' });

const db = admin.firestore();
const EMPRESA_ID = 'empresa-dev';
const MANTER = parseInt(process.argv[2], 10) || 100;

async function main() {
  console.log(`🔪 Reduzindo base de produtos pra ${MANTER}...\n`);

  const colRef = db.collection('empresas').doc(EMPRESA_ID).collection('produtos');

  // Lê todos os IDs (ordenados por nome do doc)
  const snap = await colRef.orderBy(admin.firestore.FieldPath.documentId()).get();
  const total = snap.docs.length;
  console.log(`   Total atual: ${total}`);

  if (total <= MANTER) {
    console.log(`   Já tem ${total} produtos (≤ ${MANTER}). Nada pra fazer.`);
    process.exit(0);
  }

  const aDeletar = snap.docs.slice(MANTER);
  console.log(`   Vai deletar: ${aDeletar.length} (mantém os primeiros ${MANTER})\n`);

  // Batch deletes em chunks de 450 (limite Firestore 500)
  const CHUNK = 450;
  let deletados = 0;
  for (let i = 0; i < aDeletar.length; i += CHUNK) {
    const batch = db.batch();
    aDeletar.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deletados += Math.min(CHUNK, aDeletar.length - i);
    process.stdout.write(`\r   Deletados: ${deletados}/${aDeletar.length}`);
  }
  console.log('\n');

  const remaining = await colRef.count().get();
  console.log(`🎉 Concluído. Restam ${remaining.data().count} produtos no emulator.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
