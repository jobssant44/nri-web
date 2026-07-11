import { useState, useRef, useEffect, useCallback } from 'react';
import { addDoc, getDocs, writeBatch, doc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useDb } from '../../utils/db';
import {
  D, intFmt, numFmt,
  PageContainer, PageHeader,
} from '../../design';

// ─── Mapeamento de colunas do 03.02.37 (letra Excel → índice 0-based) ────────
const CAMPOS_030237 = [
  { idx: 2,  campo: 'operacao',      label: 'Operação' },
  { idx: 3,  campo: 'vendedor',      label: 'Vendedor' },
  { idx: 4,  campo: 'motorista',     label: 'Motorista' },
  { idx: 5,  campo: 'dataOperacao',  label: 'Dt. Operação' },
  { idx: 6,  campo: 'emissao',       label: 'Emissão' },
  { idx: 7,  campo: 'nota',          label: 'Nota' },
  { idx: 9,  campo: 'status',        label: 'Status' },
  { idx: 12, campo: 'cliente',       label: 'Cliente' },
  { idx: 13, campo: 'nome',          label: 'Nome' },
  { idx: 15, campo: 'produto',       label: 'Produto' },
  { idx: 16, campo: 'unidade',       label: 'Unidade' },
  { idx: 17, campo: 'descricao',     label: 'Descrição' },
  { idx: 19, campo: 'qtde',          label: 'Qtde' },
  { idx: 20, campo: 'valor',         label: 'Valor' },
  { idx: 26, campo: 'mapa',          label: 'Mapa' },
  { idx: 66, campo: 'origemPedido',  label: 'Origem do Pedido' },
  { idx: 86, campo: 'pesoBrutoMapa', label: 'Peso Bruto Mapa' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitLinha(linha, sep) {
  const cols = [];
  let dentro = false;
  let atual = '';
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      dentro = !dentro;
    } else if (c === sep && !dentro) {
      cols.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  cols.push(atual.trim());
  return cols;
}

function parsearCSV030237(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { linhas: [], total: 0 };

  const sep = linhas[0].includes(';') ? ';' : ',';

  const dados = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = splitLinha(linhas[i], sep);
    const obj = {};
    CAMPOS_030237.forEach(({ idx, campo }) => {
      obj[campo] = (cols[idx] ?? '').replace(/^"|"$/g, '').trim();
    });
    const vazia = CAMPOS_030237.every(({ campo }) => !obj[campo]);
    if (!vazia) dados.push(obj);
  }
  return { linhas: dados, total: dados.length };
}

// ─── UI parts compartilhadas ──────────────────────────────────────────────────

function CardBase({ icone, titulo, descricao, children }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: D.radius, padding: 24, boxShadow: D.shadow,
      animation: 'wjs-fadeUp 0.3s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: D.redSoft, border: `1px solid ${D.redBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 18,
        }}>
          {icone}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 2, fontFamily: D.font }}>
            {titulo}
          </div>
          <div style={{ fontSize: 12, color: D.textSec, fontFamily: D.font }}>
            {descricao}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function BotoesUpload({ inputId, inputRef, onSelect, temPreview, onSalvar, salvando, onLimpar, mostrarLimpar }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <input ref={inputRef} type="file" accept=".csv" id={inputId} style={{ display: 'none' }} onChange={onSelect} />
      <label htmlFor={inputId} style={s.btnUpload}>📂 Selecionar CSV</label>

      {temPreview && (
        <button
          onClick={onSalvar}
          disabled={salvando}
          style={{ ...s.btnSalvar, opacity: salvando ? 0.6 : 1, cursor: salvando ? 'not-allowed' : 'pointer' }}
        >
          {salvando ? '⏳ Salvando...' : '💾 Salvar no Firebase'}
        </button>
      )}

      {mostrarLimpar && (
        <button onClick={onLimpar} style={s.btnLimpar}>✕ Limpar</button>
      )}
    </div>
  );
}

function Alerta({ tipo, children }) {
  const cores = {
    sucesso: { bg: D.greenSoft, color: D.green, border: D.greenBorder },
    erro:    { bg: D.redSoft,   color: D.red,   border: D.redBorder },
    info:    { bg: D.blueSoft,  color: D.blue,  border: D.blueBorder },
    neutro:  { bg: D.bg,        color: D.textSec, border: D.border },
  }[tipo];
  return (
    <div style={{
      padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
      marginBottom: 12, fontFamily: D.font,
      background: cores.bg, color: cores.color,
      border: `1px solid ${cores.border}`,
      borderLeft: `4px solid ${cores.color}`,
    }}>
      {children}
    </div>
  );
}

function TabelaPreview({ cabecalho, linhas, total }) {
  return (
    <div style={{
      overflowX: 'auto', borderRadius: 10,
      border: `1px solid ${D.border}`, marginTop: 4,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
        <thead>
          <tr>
            {cabecalho.map(h => (
              <th key={h} style={{
                background: D.text, color: '#fff', padding: '9px 14px',
                textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
                fontSize: 11, letterSpacing: 0.3,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.slice(0, 10).map((linha, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
              {cabecalho.map(h => (
                <td key={h} style={{
                  padding: '7px 14px', color: D.textSec,
                  borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap',
                }}>
                  {linha[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > 10 && (
        <div style={{
          padding: '8px 14px', fontSize: 11, color: D.textMuted,
          fontStyle: 'italic', borderTop: `1px solid ${D.border}`,
          background: D.bg, fontFamily: D.font,
        }}>
          … e mais {total - 10} linha(s) não exibidas
        </div>
      )}
    </div>
  );
}

function Placeholder() {
  return (
    <div style={{
      padding: 24, textAlign: 'center',
      color: D.textMuted, fontSize: 13, fontStyle: 'italic',
      fontFamily: D.font,
    }}>
      Selecione um arquivo .csv para visualizar e salvar
    </div>
  );
}

// ─── Histórico de importações ─────────────────────────────────────────────────
// Reutilizável para as coleções que ACUMULAM (1 doc por importação com linhas[]):
// 03.02.37, 03.18.05. Carrega SOB DEMANDA (não pesa no load da página) e mostra
// arquivo, quando foi importado, período coberto e nº de linhas. Permite excluir
// uma importação inteira (remove o doc daquela carga) e sinaliza possíveis
// duplicados pelo nome de arquivo. Não faz bloqueio automático — só dá visão.

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate(); // Firestore Timestamp
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function fmtData(d) {
  if (!d || isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtDataHora(v) {
  const d = toDate(v);
  if (!d) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${fmtData(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Constrói a data validando o calendário — rejeita o rollover do construtor do
// Date (ex.: "15/13/2026" viraria 15/01/2027; "32/01/2026" viraria 01/02/2026).
// Data suja retorna null (é ignorada no período em vez de distorcê-lo).
function montarData(ano, mes, dia) {
  const d = new Date(ano, mes - 1, dia);
  if (isNaN(d) || d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}
// Aceita DD/MM/AAAA, ISO AAAA-MM-DD e DD/MM/AA — com dia/mês de 1 OU 2 dígitos e
// com hora opcional depois. O Dt. Operação do 03.02.37 é texto cru do ERP, que às
// vezes exporta sem zero à esquerda ("1/2/2026"); os parsers irmãos do app
// (ReposicaoPage, _FasePage) já toleram 1-2 dígitos — seguimos o mesmo padrão.
function parseDataBR(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return montarData(+m[3], +m[2], +m[1]);
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return montarData(+m[1], +m[2], +m[3]);
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/);
  if (m) return montarData(2000 + +m[3], +m[2], +m[1]);
  return null;
}
function periodoDe(linhas, campo) {
  let min = null, max = null;
  if (Array.isArray(linhas)) {
    for (const l of linhas) {
      const d = parseDataBR(l?.[campo]);
      if (!d || isNaN(d)) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
  }
  return { min, max };
}
function periodoTexto(min, max) {
  if (!min && !max) return '—';
  if (fmtData(min) === fmtData(max)) return fmtData(min);
  return `${fmtData(min)} – ${fmtData(max)}`;
}
function marcarDuplicados(lista) {
  const cont = {};
  lista.forEach(i => { const k = i.nomeArquivo.toLowerCase(); cont[k] = (cont[k] || 0) + 1; });
  lista.forEach(i => { i.dup = cont[i.nomeArquivo.toLowerCase()] > 1; });
  return lista;
}

function HistoricoImportacoes({ colName, campoData, labelPeriodo = 'Dt. Operação', reloadKey }) {
  const { col } = useDb();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState([]);
  const [excluindo, setExcluindo] = useState('');
  const reqRef = useRef(0); // versiona as cargas: só a resposta mais recente escreve o estado

  const carregar = useCallback(async () => {
    const reqId = ++reqRef.current;
    setCarregando(true); setErro('');
    try {
      // Safety cap (regra #3 do CLAUDE.md): coleção que cresce nunca é lida inteira.
      // Lê sob demanda os imports mais recentes. Obs.: cada doc ainda traz linhas[]
      // (o Web SDK não projeta campos); se o volume do 03.02.37 crescer muito, o
      // próximo passo é mover linhas[] pra subcoleção e deixar só o resumo aqui.
      const snap = await getDocs(query(col(colName), orderBy('importadoEm', 'desc'), limit(300)));
      const lista = snap.docs.map(d => {
        const dt = d.data();
        const { min, max } = periodoDe(dt.linhas, campoData);
        return {
          id: d.id,
          nomeArquivo: (dt.nomeArquivo || '(sem nome)').trim(),
          importadoEm: dt.importadoEm,
          total: dt.totalLinhas ?? (Array.isArray(dt.linhas) ? dt.linhas.length : 0),
          min, max,
        };
      });
      lista.sort((a, b) => (toDate(b.importadoEm)?.getTime() || 0) - (toDate(a.importadoEm)?.getTime() || 0));
      if (reqId === reqRef.current) setItens(marcarDuplicados(lista));
    } catch (e) {
      if (reqId === reqRef.current) setErro('Erro ao carregar importações: ' + e.message);
    }
    if (reqId === reqRef.current) setCarregando(false);
  }, [col, colName, campoData]);

  // Recarrega quando o card avisa que salvou algo — só se o histórico estiver aberto.
  useEffect(() => {
    if (aberto) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  function abrir() { setAberto(true); carregar(); }

  async function excluir(item) {
    const ok = window.confirm(
      'Excluir esta importação?\n\n' +
      `Arquivo: ${item.nomeArquivo}\n` +
      `Importado em: ${fmtDataHora(item.importadoEm)}\n` +
      `Período: ${periodoTexto(item.min, item.max)}\n` +
      `Linhas: ${intFmt(item.total)}\n\n` +
      'Os dados desta importação serão removidos do Firebase. Não dá pra desfazer.'
    );
    if (!ok) return;
    setExcluindo(item.id);
    try {
      await deleteDoc(doc(col(colName), item.id));
      setItens(prev => marcarDuplicados(prev.filter(x => x.id !== item.id)));
    } catch (e) {
      alert('Erro ao excluir: ' + e.message);
    }
    setExcluindo('');
  }

  const th = { background: D.text, color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, letterSpacing: 0.3, whiteSpace: 'nowrap' };
  const td = { padding: '7px 12px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ marginTop: 16, borderTop: `1px dashed ${D.border}`, paddingTop: 14 }}>
      {!aberto ? (
        <button onClick={abrir} style={s.btnHist}>📋 Ver importações salvas</button>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setAberto(false)} style={s.btnHist}>▲ Ocultar importações</button>
            <button onClick={carregar} style={{ ...s.btnLimpar, opacity: (carregando || excluindo) ? 0.6 : 1 }} disabled={carregando || !!excluindo}>↻ Atualizar</button>
            {!carregando && !erro && (
              <span style={{ fontSize: 12, color: D.textMuted, fontFamily: D.font }}>
                {intFmt(itens.length)} importação(ões)
              </span>
            )}
          </div>

          {carregando && <Alerta tipo="neutro">⏳ Carregando importações…</Alerta>}
          {erro && <Alerta tipo="erro">❌ {erro}</Alerta>}

          {!carregando && !erro && itens.length === 0 && (
            <div style={{ padding: 18, textAlign: 'center', color: D.textMuted, fontSize: 13, fontStyle: 'italic', fontFamily: D.font }}>
              Nenhuma importação salva ainda.
            </div>
          )}

          {!carregando && !erro && itens.length > 0 && (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${D.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
                <thead>
                  <tr>
                    <th style={th}>Arquivo</th>
                    <th style={th}>Importado em</th>
                    <th style={th}>Período ({labelPeriodo})</th>
                    <th style={{ ...th, textAlign: 'right' }}>Linhas</th>
                    <th style={{ ...th, textAlign: 'center' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={it.id} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                      <td style={{ ...td, whiteSpace: 'normal', color: D.text, fontWeight: 600 }}>
                        {it.nomeArquivo}
                        {it.dup && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: D.amber, background: D.amberSoft, border: `1px solid ${D.amberBorder}`, borderRadius: 20, padding: '1px 7px', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
                            possível duplicado
                          </span>
                        )}
                      </td>
                      <td style={td}>{fmtDataHora(it.importadoEm)}</td>
                      <td style={td}>{periodoTexto(it.min, it.max)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: D.mono }}>{intFmt(it.total)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          onClick={() => excluir(it)}
                          disabled={excluindo === it.id}
                          style={{ ...s.btnExcluir, opacity: excluindo === it.id ? 0.6 : 1, cursor: excluindo === it.id ? 'not-allowed' : 'pointer' }}
                        >
                          {excluindo === it.id ? '⏳' : '🗑 Excluir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: D.textMuted, fontStyle: 'italic', fontFamily: D.font }}>
            "Possível duplicado" = mesmo nome de arquivo importado mais de uma vez. Confira o período antes de excluir.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Card 03.02.37 ────────────────────────────────────────────────────────────

function Card030237() {
  const { col, stamp } = useDb();
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const [reloadHist, setReloadHist] = useState(0);
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro'); setMensagem('Selecione um arquivo .csv válido.'); return;
    }
    setFase('idle'); setMensagem(''); setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { linhas, total } = parsearCSV030237(ev.target.result);
        if (total === 0) {
          setFase('erro'); setMensagem('Nenhuma linha de dados encontrada no arquivo.'); return;
        }
        setDados({ linhas, total, nomeArquivo: arquivo.name });
        setFase('preview'); setMensagem('');
      } catch {
        setFase('erro'); setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'UTF-8');
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando'); setMensagem('');
    try {
      await addDoc(col('relatorio_030237'), {
        importadoEm: new Date(),
        nomeArquivo: dados.nomeArquivo,
        totalLinhas: dados.total,
        linhas: dados.linhas,
        ...stamp(),
      });
      setFase('salvo');
      setMensagem(`${intFmt(dados.total)} linha(s) salvas com sucesso.`);
      setDados(null);
      setReloadHist(k => k + 1);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <CardBase icone="📄" titulo="03.02.37" descricao={`Relatório de prejuízo — ${CAMPOS_030237.length} campos mapeados por posição de coluna`}>
      <BotoesUpload
        inputId="file-030237" inputRef={inputRef} onSelect={handleArquivo}
        temPreview={temPreview} onSalvar={handleSalvar} salvando={fase === 'salvando'}
        onLimpar={handleLimpar} mostrarLimpar={temPreview || fase === 'salvo' || fase === 'erro'}
      />

      {fase === 'salvo' && <Alerta tipo="sucesso">✅ {mensagem}</Alerta>}
      {fase === 'erro'  && <Alerta tipo="erro">❌ {mensagem}</Alerta>}

      {temPreview && dados && (
        <Alerta tipo="info">
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{intFmt(dados.total)}</strong> linha(s) prontas para salvar
        </Alerta>
      )}

      {temPreview && dados && (
        <TabelaPreview
          cabecalho={CAMPOS_030237.map(c => c.label)}
          linhas={dados.linhas.map(l => Object.fromEntries(CAMPOS_030237.map(c => [c.label, l[c.campo]])))}
          total={dados.total}
        />
      )}

      {fase === 'idle' && <Placeholder />}

      <HistoricoImportacoes colName="relatorio_030237" campoData="dataOperacao" reloadKey={reloadHist} />
    </CardBase>
  );
}

// ─── Card 03.01.47.01 — Hecto por dia ────────────────────────────────────────

function parsearHecto(valor) {
  const str = String(valor ?? '').trim().replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function Card030147Hecto() {
  const { col, db, stamp } = useDb();
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro'); setMensagem('Selecione um arquivo .csv válido.'); return;
    }
    setFase('idle'); setMensagem(''); setDados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const linhas = texto.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) { setFase('erro'); setMensagem('Arquivo vazio ou sem dados.'); return; }
        const sep = linhas[0].includes(';') ? ';' : ',';

        const mapa = new Map();
        for (let i = 1; i < linhas.length; i++) {
          const cols = splitLinha(linhas[i], sep);
          const tipoPedido = (cols[36] ?? '').replace(/^"|"$/g, '').trim();
          if (tipoPedido !== 'Pedido Normal') continue;
          const data  = (cols[24] ?? '').replace(/^"|"$/g, '').trim();
          const hecto = parsearHecto((cols[35] ?? '').replace(/^"|"$/g, ''));
          if (!data) continue;
          mapa.set(data, (mapa.get(data) ?? 0) + hecto);
        }

        if (mapa.size === 0) {
          setFase('erro'); setMensagem('Nenhuma linha com "Pedido Normal" encontrada.'); return;
        }

        const resultado = [...mapa.entries()]
          .map(([data, totalHecto]) => ({ data, totalHecto: Math.round(totalHecto * 100) / 100 }))
          .sort((a, b) => {
            const parseData = (d) => {
              const partes = d.includes('/') ? d.split('/') : d.split('-');
              if (partes.length === 3) {
                return partes[0].length === 4
                  ? new Date(partes[0], partes[1] - 1, partes[2])
                  : new Date(partes[2], partes[1] - 1, partes[0]);
              }
              return new Date(d);
            };
            return parseData(a.data) - parseData(b.data);
          });

        setDados({ linhas: resultado, nomeArquivo: arquivo.name });
        setFase('preview');
      } catch {
        setFase('erro'); setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'latin1');
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando'); setMensagem('');
    try {
      const snap = await getDocs(col('relatorio_030147hecto'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      for (let i = 0; i < dados.linhas.length; i += 450) {
        const batch = writeBatch(db);
        dados.linhas.slice(i, i + 450).forEach(linha => {
          batch.set(doc(col('relatorio_030147hecto')), {
            data:        linha.data,
            totalHecto:  linha.totalHecto,
            importadoEm: new Date().toISOString(),
            nomeArquivo: dados.nomeArquivo,
            ...stamp(),
          });
        });
        await batch.commit();
      }
      setFase('salvo');
      setMensagem(`${intFmt(dados.linhas.length)} data(s) salvas com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <CardBase
      icone="📊"
      titulo="03.01.47.01 — Hecto por Dia"
      descricao='Lê colunas Y (Data) e AJ (Hecto), filtra AK = "Pedido Normal", soma por dia'
    >
      <BotoesUpload
        inputId="file-030147hecto" inputRef={inputRef} onSelect={handleArquivo}
        temPreview={temPreview} onSalvar={handleSalvar} salvando={fase === 'salvando'}
        onLimpar={handleLimpar} mostrarLimpar={temPreview || fase === 'salvo' || fase === 'erro'}
      />

      {fase === 'salvo' && <Alerta tipo="sucesso">✅ {mensagem}</Alerta>}
      {fase === 'erro'  && <Alerta tipo="erro">❌ {mensagem}</Alerta>}

      {temPreview && dados && (
        <Alerta tipo="info">
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{intFmt(dados.linhas.length)}</strong> data(s) com somatório de Hecto
        </Alerta>
      )}

      {temPreview && dados && (
        <TabelaPreview
          cabecalho={['Data', 'Total Hecto']}
          linhas={dados.linhas.map(l => ({ 'Data': l.data, 'Total Hecto': numFmt(l.totalHecto) }))}
          total={dados.linhas.length}
        />
      )}

      {fase === 'idle' && <Placeholder />}
    </CardBase>
  );
}

// ─── Card genérico (Refugo) ───────────────────────────────────────────────────

function CardRefugo({ label, descricao, icon, id }) {
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith('.csv')) {
      setFase('erro'); setMensagem('Selecione um arquivo .csv válido.'); setPreview(null); return;
    }
    setFase('carregando'); setMensagem(''); setPreview(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = ev.target.result;
        const linhas = texto.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) { setFase('erro'); setMensagem('Arquivo vazio.'); return; }
        const sep = linhas[0].includes(';') ? ';' : ',';
        const cabecalho = linhas[0].split(sep).map(c => c.trim());
        const dados = linhas.slice(1).map(l => {
          const cols = l.split(sep).map(c => c.trim());
          const obj = {};
          cabecalho.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
          return obj;
        });
        setPreview({ cabecalho, linhas: dados, nomeArquivo: arquivo.name, total: dados.length });
        setFase('ok');
        setMensagem(`${intFmt(dados.length)} linha(s) carregadas.`);
      } catch {
        setFase('erro'); setMensagem('Erro ao processar o arquivo.');
      }
    };
    reader.onerror = () => { setFase('erro'); setMensagem('Falha ao ler o arquivo.'); };
    reader.readAsText(arquivo, 'UTF-8');
    e.target.value = '';
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <CardBase icone={icon} titulo={label} descricao={descricao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept=".csv" id={`file-${id}`} style={{ display: 'none' }} onChange={handleArquivo} />
        <label htmlFor={`file-${id}`} style={s.btnUpload}>📂 Selecionar CSV</label>
        {preview && <button onClick={handleLimpar} style={s.btnLimpar}>✕ Limpar</button>}
      </div>

      {fase === 'ok'         && <Alerta tipo="sucesso">✅ {mensagem}</Alerta>}
      {fase === 'erro'       && <Alerta tipo="erro">❌ {mensagem}</Alerta>}
      {fase === 'carregando' && <Alerta tipo="neutro">⏳ Processando...</Alerta>}

      {preview && (
        <TabelaPreview cabecalho={preview.cabecalho} linhas={preview.linhas} total={preview.total} />
      )}

      {fase === 'idle' && (
        <div style={{
          padding: 24, textAlign: 'center',
          color: D.textMuted, fontSize: 13, fontStyle: 'italic', fontFamily: D.font,
        }}>
          Selecione um arquivo .csv para visualizar
        </div>
      )}
    </CardBase>
  );
}

// ─── Card 03.18.05 — Reposições (Excel/CSV) ──────────────────────────────────
// Mapeamento explícito de colunas (letra Excel → índice 0-based):
//   C=2 cliente · I=8 statusSolicitacao · K=10 aprovador · M=12 notaFiscal
//   N=13 statusNF · W=22 motivo · AE=30 placa · AH=33 codMotorista
//   AI=34 nomeMotorista · AJ=35 codAjudante · AK=36 nomeAjudante
//   AN=39 solicitante · BG=58 opcaoReposicao
// Nota fiscal (M) vem como "xxxxx-001" — só guardamos a parte antes do "-".

const CAMPOS_031805 = [
  { idx: 2,  campo: 'cliente',           label: 'Cliente' },
  { idx: 8,  campo: 'statusSolicitacao', label: 'Status Solicitação' },
  { idx: 10, campo: 'aprovador',         label: 'Aprovador' },
  { idx: 12, campo: 'notaFiscal',        label: 'Nota Fiscal' },
  { idx: 13, campo: 'statusNF',          label: 'Status NF' },
  { idx: 22, campo: 'motivo',            label: 'Motivo' },
  { idx: 30, campo: 'placa',             label: 'Placa' },
  { idx: 33, campo: 'codMotorista',      label: 'Cód. Motorista' },
  { idx: 34, campo: 'nomeMotorista',     label: 'Nome do Motorista' },
  { idx: 35, campo: 'codAjudante',       label: 'Cód. Ajudante' },
  { idx: 36, campo: 'nomeAjudante',      label: 'Nome do Ajudante' },
  { idx: 39, campo: 'solicitante',       label: 'Solicitante' },
  { idx: 58, campo: 'opcaoReposicao',    label: 'Opção de Reposição' },
];

function extrairLinha031805(cols) {
  const obj = {};
  CAMPOS_031805.forEach(({ idx, campo }) => {
    const raw = (cols[idx] ?? '').toString().replace(/^"|"$/g, '').trim();
    if (campo === 'notaFiscal') {
      // "xxxxx-001" → "xxxxx" (mantém só o que vem antes do hífen)
      obj[campo] = raw.split('-')[0].trim();
    } else {
      obj[campo] = raw;
    }
  });
  return obj;
}

function Card031805() {
  const { col, stamp } = useDb();
  const [fase, setFase] = useState('idle');
  const [mensagem, setMensagem] = useState('');
  const [dados, setDados] = useState(null);
  const inputRef = useRef(null);

  function lerExcel(arquivo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb    = XLSX.read(ev.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          // Pula a 1ª linha (cabeçalho) e extrai por índice
          const linhas = rows.slice(1)
            .filter(r => Array.isArray(r) && r.some(c => c !== '' && c != null))
            .map(extrairLinha031805)
            .filter(o => CAMPOS_031805.some(({ campo }) => o[campo]));
          resolve(linhas);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsArrayBuffer(arquivo);
    });
  }

  // Decodifica auto: tenta UTF-8 estrito (fatal). Se cair, usa windows-1252
  // (superset de latin1) — formato padrão dos exports AMBEV/CSI. Evita o
  // caractere U+FFFD que apareceu em "Jo�o".
  function decodificarTexto(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function lerCSV(arquivo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const texto = decodificarTexto(ev.target.result);
          const linhasRaw = texto.split(/\r?\n/).filter(l => l.trim());
          if (linhasRaw.length < 2) return reject(new Error('Arquivo vazio.'));
          const sep = linhasRaw[0].includes(';') ? ';' : ',';
          const linhas = linhasRaw.slice(1)
            .map(l => extrairLinha031805(splitLinha(l, sep)))
            .filter(o => CAMPOS_031805.some(({ campo }) => o[campo]));
          resolve(linhas);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsArrayBuffer(arquivo);
    });
  }

  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    const ehExcel = nome.endsWith('.xlsx') || nome.endsWith('.xls');
    const ehCSV   = nome.endsWith('.csv');
    if (!ehExcel && !ehCSV) {
      setFase('erro'); setMensagem('Selecione um arquivo .xlsx, .xls ou .csv.');
      e.target.value = ''; return;
    }
    setFase('carregando'); setMensagem(''); setDados(null);
    try {
      const linhas = ehExcel ? await lerExcel(arquivo) : await lerCSV(arquivo);
      if (linhas.length === 0) {
        setFase('erro'); setMensagem('Nenhuma linha de dados encontrada.'); return;
      }
      setDados({ linhas, total: linhas.length, nomeArquivo: arquivo.name });
      setFase('preview');
    } catch (err) {
      setFase('erro'); setMensagem(err.message || 'Erro ao processar o arquivo.');
    }
    e.target.value = '';
  }

  async function handleSalvar() {
    if (!dados) return;
    setFase('salvando'); setMensagem('');
    try {
      // Append igual o 03.02.37: cada import = um doc novo em `relatorio_031805`
      await addDoc(col('relatorio_031805'), {
        importadoEm: new Date(),
        nomeArquivo: dados.nomeArquivo,
        totalLinhas: dados.total,
        linhas:      dados.linhas,
        ...stamp(),
      });
      setFase('salvo');
      setMensagem(`${intFmt(dados.total)} linha(s) salvas com sucesso.`);
      setDados(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setFase('erro');
      setMensagem(`Erro ao salvar no Firebase: ${err.message}`);
    }
  }

  function handleLimpar() {
    setFase('idle'); setMensagem(''); setDados(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const temPreview = fase === 'preview' || fase === 'salvando';

  return (
    <CardBase
      icone="🔁"
      titulo="03.18.05 — Reposições"
      descricao={`Relatório de reposições — aceita Excel (.xlsx, .xls) ou CSV. ${CAMPOS_031805.length} campos mapeados por posição de coluna.`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          id="file-031805"
          style={{ display: 'none' }}
          onChange={handleArquivo}
        />
        <label htmlFor="file-031805" style={s.btnUpload}>📂 Selecionar arquivo</label>

        {temPreview && (
          <button
            onClick={handleSalvar}
            disabled={fase === 'salvando'}
            style={{ ...s.btnSalvar, opacity: fase === 'salvando' ? 0.6 : 1, cursor: fase === 'salvando' ? 'not-allowed' : 'pointer' }}
          >
            {fase === 'salvando' ? '⏳ Salvando...' : '💾 Salvar no Firebase'}
          </button>
        )}

        {(temPreview || fase === 'salvo' || fase === 'erro') && (
          <button onClick={handleLimpar} style={s.btnLimpar}>✕ Limpar</button>
        )}
      </div>

      {fase === 'carregando' && <Alerta tipo="neutro">⏳ Processando...</Alerta>}
      {fase === 'salvo'      && <Alerta tipo="sucesso">✅ {mensagem}</Alerta>}
      {fase === 'erro'       && <Alerta tipo="erro">❌ {mensagem}</Alerta>}

      {temPreview && dados && (
        <Alerta tipo="info">
          📋 Arquivo: <strong>{dados.nomeArquivo}</strong> · <strong>{intFmt(dados.total)}</strong> linha(s) prontas para salvar
        </Alerta>
      )}

      {temPreview && dados && (
        <TabelaPreview
          cabecalho={CAMPOS_031805.map(c => c.label)}
          linhas={dados.linhas.map(l => Object.fromEntries(CAMPOS_031805.map(c => [c.label, l[c.campo]])))}
          total={dados.total}
        />
      )}

      {fase === 'idle' && <Placeholder />}
    </CardBase>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ImportarRelatoriosPrejuizo() {
  return (
    <PageContainer maxWidth={1100}>
      <PageHeader
        kicker="Gestão de Prejuízo"
        titulo="Importar Relatórios"
        sub="Selecione os arquivos para cada relatório de prejuízo."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card030237 />
        <Card030147Hecto />
        <Card031805 />
        <CardRefugo id="refugo_afericao" label="Refugo fábrica - aferição" descricao="Relatório de refugo de fábrica (aferição)" icon="🏭" />
        <CardRefugo id="refugo_cobranca" label="Refugo fábrica - cobrança" descricao="Relatório de refugo de fábrica (cobrança)" icon="💰" />
      </div>
    </PageContainer>
  );
}

// ─── Estilos locais de botão ──────────────────────────────────────────────────

const s = {
  btnUpload: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 18px', background: D.red, color: '#fff',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', userSelect: 'none', fontFamily: D.font,
    transition: D.transition,
  },
  btnSalvar: {
    padding: '9px 18px', background: D.green, color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    fontFamily: D.font, transition: D.transition,
  },
  btnLimpar: {
    padding: '8px 14px', background: 'transparent',
    border: `1px solid ${D.border}`, color: D.textSec,
    borderRadius: 8, fontSize: 12, cursor: 'pointer',
    fontWeight: 500, fontFamily: D.font, transition: D.transition,
  },
  btnHist: {
    padding: '7px 13px', background: 'transparent',
    border: `1px solid ${D.border}`, color: D.text,
    borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
    fontWeight: 600, fontFamily: D.font, transition: D.transition,
  },
  btnExcluir: {
    padding: '5px 11px', background: 'transparent',
    border: `1px solid ${D.redBorder}`, color: D.red,
    borderRadius: 6, fontSize: 11.5, fontWeight: 600,
    fontFamily: D.font, transition: D.transition, whiteSpace: 'nowrap',
  },
};
