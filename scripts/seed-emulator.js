/**
 * Seed mínimo do Firebase Emulator (Firestore + Auth).
 *
 * Pré-requisito: emulator rodando em outra aba do terminal (npm run emulators).
 *
 * Uso:
 *   npm run seed
 *
 * O que cria:
 *   - 1 usuário no Auth (admin@dev.local / admin123)
 *   - 1 doc em empresas/empresa-dev (com todos os módulos habilitados)
 *   - 1 doc em usuarios_global/{uid} (vinculando o admin à empresa-dev)
 *   - 3 produtos de exemplo em empresas/empresa-dev/produtos/
 *   - 2 locations de exemplo em empresas/empresa-dev/locations/
 *
 * Pra rodar com dados de produção: exporte do projeto real
 *   `firebase firestore:export ./prod-backup --project app-nri-e0598`
 *   e importe via `npm run emulators -- --import=./prod-backup`.
 */
const admin = require('firebase-admin');

// Apontar firebase-admin pro emulator (não toca em produção)
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

admin.initializeApp({ projectId: 'app-nri-e0598' });

const db = admin.firestore();
const auth = admin.auth();

const EMPRESA_ID = 'empresa-dev';
const EMAIL      = 'admin@dev.local';
const SENHA      = 'admin123';

async function seed() {
  console.log('🌱 Populando emulator...\n');

  // 1. Auth user
  let user;
  try {
    user = await auth.createUser({
      email: EMAIL,
      password: SENHA,
      displayName: 'Admin Dev',
    });
    console.log(`   ✅ Auth user criado: ${user.uid}`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      user = await auth.getUserByEmail(EMAIL);
      console.log(`   ℹ️  Auth user já existe: ${user.uid}`);
    } else {
      throw e;
    }
  }

  // 2. Empresa (todos os módulos habilitados pra testar tudo)
  await db.collection('empresas').doc(EMPRESA_ID).set({
    nome: 'Empresa Dev (Emulator)',
    modulos: [
      'nri', 'reab', 'curva-abc',
      'gerenciamento-estoque', 'gestao-idade',
      'gestao-prejuizo', 'gestao-mpd',
      'portaria', 'tma', 'plano-acao',
    ],
    revendas: ['CBM Carpina'],
  });
  console.log(`   ✅ empresas/${EMPRESA_ID}`);

  // 3. Vínculo global
  await db.collection('usuarios_global').doc(user.uid).set({
    nome: 'Admin Dev',
    nivel: 'admin',
    empresaId: EMPRESA_ID,
    revendaId: 'CBM Carpina',
  });
  console.log(`   ✅ usuarios_global/${user.uid}`);

  // 4. Catálogo mínimo (produtos)
  const produtosBase = [
    { codigo: '12345', nome: 'BRAHMA LATA 350ML',     cxPorPlt: 105, curva: 'A' },
    { codigo: '12346', nome: 'SKOL LATA 350ML',       cxPorPlt: 105, curva: 'A' },
    { codigo: '12347', nome: 'ANTARCTICA LATA 350ML', cxPorPlt: 105, curva: 'B' },
  ];
  for (const p of produtosBase) {
    await db.collection('empresas').doc(EMPRESA_ID)
      .collection('produtos').doc(p.codigo).set(p);
  }
  console.log(`   ✅ ${produtosBase.length} produtos`);

  // 5. Locations mínimas
  const locationsBase = [
    { area: 'EstoqueA', rua: '01', posicao: '001', assignedSkuId: '12345', endereco: 'A-1-001', curva: 'A' },
    { area: 'EstoqueA', rua: '01', posicao: '002', assignedSkuId: '12346', endereco: 'A-1-002', curva: 'A' },
  ];
  for (const [i, l] of locationsBase.entries()) {
    await db.collection('empresas').doc(EMPRESA_ID)
      .collection('locations').doc(`loc-${i + 1}`).set(l);
  }
  console.log(`   ✅ ${locationsBase.length} locations`);

  console.log('\n🎉 Seed concluído! Próximos passos:\n');
  console.log('   1. (Outra aba) npm run start:dev');
  console.log('   2. Abra:        http://localhost:3000');
  console.log(`   3. Login:       ${EMAIL} / ${SENHA}`);
  console.log('   4. UI Emulator: http://localhost:4000\n');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro no seed:', err);
    process.exit(1);
  });
