/**
 * HistoricoImportacoes — componente reutilizável.
 *
 * Lista os batches gravados em `colName` (1 doc por importação, com `linhas[]`)
 * mostrando arquivo, data de import, período coberto e nº de linhas, e permite
 * excluir uma importação inteira (apaga o doc). Sinaliza possíveis duplicados
 * pelo NOME DO ARQUIVO (só visual — sem bloqueio).
 *
 * Extraído de ImportarRelatoriosPrejuizo.js (o Card030237/031805 já usava o
 * mesmo componente local). Reusado agora pelo 03.11.20 do MPD.
 *
 * Props:
 *   colName      string  nome da coleção que acumula (ex.: 'relatorio_030237', 'relatorio031120')
 *   campoData    string  campo de data dentro de cada linha[] pra calcular o período (opcional)
 *   labelPeriodo string  label do período no cabeçalho (default: "Dt. Operação")
 *   reloadKey    number  incrementar após salvar recarrega a lista (se ela estiver aberta)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { useDb } from '../../utils/db';
import { D, intFmt } from '../../design';

// ─── Helpers de data ─────────────────────────────────────────────────────────
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
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
function montarData(ano, mes, dia) {
  const d = new Date(ano, mes - 1, dia);
  if (isNaN(d) || d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}
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

// ─── Estilos ─────────────────────────────────────────────────────────────────
const btnHist = {
  padding: '7px 13px', background: 'transparent',
  border: `1px solid ${D.border}`, color: D.text,
  borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
  fontWeight: 600, fontFamily: D.font, transition: D.transition,
};
const btnLimpar = {
  padding: '8px 14px', background: 'transparent',
  border: `1px solid ${D.border}`, color: D.textSec,
  borderRadius: 8, fontSize: 12, cursor: 'pointer',
  fontWeight: 500, fontFamily: D.font, transition: D.transition,
};
const btnExcluir = {
  padding: '5px 11px', background: 'transparent',
  border: `1px solid ${D.redBorder}`, color: D.red,
  borderRadius: 6, fontSize: 11.5, fontWeight: 600,
  fontFamily: D.font, transition: D.transition, whiteSpace: 'nowrap',
};

function Alerta({ tipo, children }) {
  const cores = {
    erro:   { bg: D.redSoft,  color: D.red,     border: D.redBorder },
    neutro: { bg: D.bg,       color: D.textSec, border: D.border },
  }[tipo] || { bg: D.bg, color: D.textSec, border: D.border };
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

// ─── Componente ──────────────────────────────────────────────────────────────
export function HistoricoImportacoes({ colName, campoData, labelPeriodo = 'Dt. Operação', reloadKey }) {
  const { col } = useDb();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState([]);
  const [excluindo, setExcluindo] = useState('');
  const reqRef = useRef(0);

  const carregar = useCallback(async () => {
    const reqId = ++reqRef.current;
    setCarregando(true); setErro('');
    try {
      // Safety cap: lê só os imports mais recentes (regra #3 do CLAUDE.md).
      // Fallback sem orderBy pra coleções que só têm formato ANTIGO (docs 1/linha)
      // sem `importadoEm` — a query orderBy filtra fora e daria "vazio" mesmo com
      // docs presentes. Sem orderBy, deixa aparecer pra explicar a lista vazia
      // (só docs com `linhas[]` viram itens; docs sem viram silêncio).
      let snap;
      try {
        snap = await getDocs(query(col(colName), orderBy('importadoEm', 'desc'), limit(300)));
      } catch {
        snap = await getDocs(col(colName));
      }
      const lista = snap.docs
        .map(d => {
          const dt = d.data();
          if (!Array.isArray(dt.linhas)) return null; // ignora docs no formato antigo (1 por linha)
          const { min, max } = campoData ? periodoDe(dt.linhas, campoData) : { min: null, max: null };
          return {
            id: d.id,
            nomeArquivo: (dt.nomeArquivo || '(sem nome)').trim(),
            importadoEm: dt.importadoEm,
            total: dt.totalLinhas ?? dt.linhas.length,
            min, max,
          };
        })
        .filter(Boolean);
      lista.sort((a, b) => (toDate(b.importadoEm)?.getTime() || 0) - (toDate(a.importadoEm)?.getTime() || 0));
      if (reqId === reqRef.current) setItens(marcarDuplicados(lista));
    } catch (e) {
      if (reqId === reqRef.current) setErro('Erro ao carregar importações: ' + e.message);
    }
    if (reqId === reqRef.current) setCarregando(false);
  }, [col, colName, campoData]);

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
      (campoData ? `Período: ${periodoTexto(item.min, item.max)}\n` : '') +
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
        <button onClick={abrir} style={btnHist}>📋 Ver importações salvas</button>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setAberto(false)} style={btnHist}>▲ Ocultar importações</button>
            <button onClick={carregar} style={{ ...btnLimpar, opacity: (carregando || excluindo) ? 0.6 : 1 }} disabled={carregando || !!excluindo}>↻ Atualizar</button>
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
                    {campoData && <th style={th}>Período ({labelPeriodo})</th>}
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
                      {campoData && <td style={td}>{periodoTexto(it.min, it.max)}</td>}
                      <td style={{ ...td, textAlign: 'right', fontFamily: D.mono }}>{intFmt(it.total)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          onClick={() => excluir(it)}
                          disabled={excluindo === it.id}
                          style={{ ...btnExcluir, opacity: excluindo === it.id ? 0.6 : 1, cursor: excluindo === it.id ? 'not-allowed' : 'pointer' }}
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
