/**
 * Backup completo do Firestore — salva cada documento como JSON local.
 *
 * Como usar:
 *   1. Garanta que `service-account-key.json` está na raiz do projeto.
 *   2. Rode:  node backup-firestore.js
 *   3. A pasta `backup-YYYY-MM-DD/` será criada com todos os dados.
 *
 * O script:
 *   - Percorre TODAS as collections raiz e suas subcollections recursivamente
 *     (essencial pro multi-tenant /empresas/{id}/...).
 *   - Converte Timestamps do Firestore pra string ISO (legível e re-importável).
 *   - Mostra progresso por collection.
 *   - Falha de forma clara se a quota estourar (RESOURCE_EXHAUSTED).
 *
 * NUNCA commite o `service-account-key.json` — já está no .gitignore.
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ─── Inicialização ─────────────────────────────────────────────────────────
const KEY_PATH = path.join(__dirname, 'service-account-key.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error('❌ Arquivo service-account-key.json não encontrado na raiz do projeto.');
  console.error('   Crie em: Firebase Console → ⚙ Configurações → Contas de serviço → Gerar nova chave privada');
  process.exit(1);
}

const serviceAccount = require(KEY_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// ─── Diretório de saída ────────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const BACKUP_DIR = path.join(__dirname, `backup-${hoje}`);

if (fs.existsSync(BACKUP_DIR)) {
  console.warn(`⚠️  Pasta ${BACKUP_DIR} já existe. Será sobrescrita.`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Converte Timestamps do Firestore pra string ISO e mantém o resto intacto. */
function serializarValor(valor) {
  if (valor === null || valor === undefined) return valor;
  if (valor instanceof admin.firestore.Timestamp) {
    return { __type: 'timestamp', iso: valor.toDate().toISOString() };
  }
  if (valor instanceof admin.firestore.GeoPoint) {
    return { __type: 'geopoint', latitude: valor.latitude, longitude: valor.longitude };
  }
  if (valor instanceof admin.firestore.DocumentReference) {
    return { __type: 'ref', path: valor.path };
  }
  if (Array.isArray(valor)) return valor.map(serializarValor);
  if (typeof valor === 'object') {
    const out = {};
    for (const k of Object.keys(valor)) out[k] = serializarValor(valor[k]);
    return out;
  }
  return valor;
}

/** Salva um documento como JSON, criando os diretórios necessários. */
function salvarDoc(dirPath, docId, dados) {
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, `${docId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(serializarValor(dados), null, 2), 'utf8');
}

/** Backup recursivo de uma collection e todas as suas subcollections. */
async function backupCollection(collectionRef, dirPath, indent = '') {
  let snap;
  try {
    snap = await collectionRef.get();
  } catch (e) {
    if (e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message || '')) {
      console.error(`\n❌ Quota de leitura do Firestore estourada.`);
      console.error(`   Espere o reset (00h Pacific Time = ~4h da manhã horário de Brasília) e rode novamente.`);
      console.error(`   Os dados que já foram salvos estão em: ${BACKUP_DIR}`);
      process.exit(2);
    }
    throw e;
  }

  console.log(`${indent}📁 ${collectionRef.path}: ${snap.size} doc(s)`);

  for (const doc of snap.docs) {
    salvarDoc(dirPath, doc.id, doc.data());

    // Recurse nas subcollections
    const subcols = await doc.ref.listCollections();
    for (const subcol of subcols) {
      await backupCollection(
        subcol,
        path.join(dirPath, doc.id, subcol.id),
        indent + '  '
      );
    }
  }
}

// ─── Run ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🗄️  Backup do Firestore`);
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log(`💾 Destino: ${BACKUP_DIR}\n`);

  const inicio = Date.now();
  try {
    const rootCollections = await db.listCollections();
    if (rootCollections.length === 0) {
      console.warn('⚠️  Nenhuma collection encontrada no Firestore.');
      process.exit(0);
    }

    console.log(`Encontradas ${rootCollections.length} collection(s) raiz:`);
    rootCollections.forEach(c => console.log(`  - ${c.id}`));
    console.log('');

    for (const col of rootCollections) {
      await backupCollection(col, path.join(BACKUP_DIR, col.id));
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✅ Backup concluído em ${segundos}s`);
    console.log(`📂 Pasta: ${BACKUP_DIR}`);
    console.log(`\n💡 Dica: copie a pasta pra um pendrive / Google Drive / e-mail.`);
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Erro durante o backup: ${e.message}`);
    console.error(`   Os dados que já foram salvos estão em: ${BACKUP_DIR}`);
    process.exit(1);
  }
})();
