/**
 * Backup completo do Firestore — salva cada documento como JSON local.
 *
 * Como usar:
 *   1. Garanta que `service-account-key.json` está na raiz do projeto.
 *   2. Rode:  node backup-firestore.js
 *   3. A pasta `backup-YYYY-MM-DD/` será criada com todos os dados.
 *
 * Características:
 *   - IDEMPOTENTE: rode quantas vezes quiser. Docs já salvos são pulados.
 *     Se cair no meio, basta rodar de novo e ele completa.
 *   - PAGINAÇÃO: usa limit(200) + startAfter() pra não baixar collections
 *     enormes de uma vez (evita timeout do gRPC em collections grandes).
 *   - RETRY: cada chamada de rede tenta até 3 vezes com backoff exponencial.
 *   - RECURSÃO: percorre subcollections automaticamente (multi-tenant).
 *   - Converte Timestamps do Firestore pra string ISO (legível e re-importável).
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

// Aumenta limite de cliente HTTP/gRPC pra collections maiores
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Diretório de saída ────────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const BACKUP_DIR = path.join(__dirname, `backup-${hoje}`);

const PAGINA_TAM      = 200;   // docs por requisição
const MAX_RETRIES     = 3;
const RETRY_BASE_MS   = 1500;  // backoff exponencial: 1.5s, 3s, 6s

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

/** Caminho de arquivo pra um doc dentro do backup. */
function pathDoArquivo(dirPath, docId) {
  return path.join(dirPath, `${docId}.json`);
}

/** Salva um documento como JSON, criando os diretórios necessários. */
function salvarDoc(dirPath, docId, dados) {
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = pathDoArquivo(dirPath, docId);
  fs.writeFileSync(filePath, JSON.stringify(serializarValor(dados), null, 2), 'utf8');
}

/** Retry com backoff exponencial em torno de uma operação async. */
async function tentar(operacao, descricao) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await operacao();
    } catch (e) {
      const ehUltimo = i === MAX_RETRIES - 1;
      const ehQuota = e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message || '');
      if (ehQuota) {
        console.error(`\n❌ Quota de leitura do Firestore estourada.`);
        console.error(`   Espere o reset (~4h da manhã horário de Brasília) e rode novamente.`);
        console.error(`   Os dados já salvos estão em: ${BACKUP_DIR}`);
        process.exit(2);
      }
      if (ehUltimo) throw e;
      const espera = RETRY_BASE_MS * Math.pow(2, i);
      console.warn(`   ⚠ ${descricao} falhou (${e.message.slice(0, 80)}…). Retry em ${espera}ms (${i + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, espera));
    }
  }
}

/**
 * Backup paginado e idempotente de uma collection (recursivo em subcollections).
 */
async function backupCollection(collectionRef, dirPath, indent = '') {
  fs.mkdirSync(dirPath, { recursive: true });

  let pulados   = 0;
  let novos     = 0;
  let last      = null;
  let primeiraPagina = true;

  while (true) {
    const snap = await tentar(async () => {
      let q = collectionRef.orderBy('__name__').limit(PAGINA_TAM);
      if (last) q = q.startAfter(last);
      return await q.get();
    }, `Leitura de ${collectionRef.path}`);

    if (snap.empty && primeiraPagina) {
      console.log(`${indent}📂 ${collectionRef.path}: 0 doc(s)`);
      return;
    }
    if (snap.empty) break;
    primeiraPagina = false;

    for (const doc of snap.docs) {
      const arq = pathDoArquivo(dirPath, doc.id);

      // Idempotência: pula se já existe
      if (fs.existsSync(arq)) {
        pulados++;
      } else {
        salvarDoc(dirPath, doc.id, doc.data());
        novos++;
      }

      // Recursa em subcollections (sempre — pode ter sub nova)
      const subcols = await tentar(
        async () => await doc.ref.listCollections(),
        `listCollections de ${doc.ref.path}`
      );
      for (const subcol of subcols) {
        await backupCollection(
          subcol,
          path.join(dirPath, doc.id, subcol.id),
          indent + '  '
        );
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGINA_TAM) break;
  }

  const total = pulados + novos;
  const tagSkip = pulados > 0 ? ` (${pulados} já em cache)` : '';
  console.log(`${indent}📂 ${collectionRef.path}: ${total} doc(s)${tagSkip}`);
}

// ─── Run ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🗄️  Backup do Firestore`);
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log(`💾 Destino: ${BACKUP_DIR}\n`);

  const inicio = Date.now();
  try {
    const rootCollections = await tentar(
      async () => await db.listCollections(),
      'listCollections raiz'
    );
    if (rootCollections.length === 0) {
      console.warn('⚠️  Nenhuma collection encontrada no Firestore.');
      process.exit(0);
    }

    console.log(`Encontradas ${rootCollections.length} collection(s) raiz.`);
    console.log(`Iniciando backup (idempotente — rode de novo se cair)...\n`);

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
    console.error(`   Rode o script de novo — ele vai continuar do ponto onde parou.`);
    console.error(`   Os dados que já foram salvos estão em: ${BACKUP_DIR}`);
    process.exit(1);
  }
})();
