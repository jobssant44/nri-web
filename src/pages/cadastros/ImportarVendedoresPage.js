/**
 * Importar Vendedores (Relatório 01.02.46).
 *
 * Formato esperado (Excel/CSV):
 *   B = Código do setor (= mesmo "vendedor" do relatório 03.02.37)
 *   C = Nome do RN (Representante de Negócio)
 *   D = Código do GV (Gerente de Vendas)
 *   E = Nome do GV
 *   (demais colunas são ignoradas)
 *
 * Grava em `vendedores/{codigo}` = { codigo, nome, codigoGV, nomeGV, atualizadoEm }.
 *
 * O nome do RN é usado pra exibir nas telas que mostram vendedor
 * (Reposição, WQI, Troca, etc.) substituindo o número pelo nome.
 */
import React, { useState, useEffect } from 'react';
import {
  getDocs, deleteDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../admin/ConfigurarEmpresaPage';
import {
  D, PageContainer, PageHeader, EmptyState,
  sInput, tdStyle,
} from '../../design';

export default function ImportarVendedoresPage() {
  const { col, docRef, db, stamp } = useDb();
  const { usuario } = useUser();
  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario?.nivel);

  const [arquivo, setArquivo] = useState(null);
  const [linhasValidas, setLinhasValidas] = useState([]);
  const [erros, setErros] = useState([]);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [existentes, setExistentes] = useState([]);
  const [busca, setBusca] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarExistentes(); }, []);

  async function carregarExistentes() {
    try {
      const snap = await getDocs(col('vendedores'));
      setExistentes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }

  async function processarArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setArquivo(file);
    setMessage(''); setErros([]); setPreview([]); setLinhasValidas([]);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) {
        setMessage('❌ Arquivo vazio.');
        return;
      }

      // 1ª linha pode ser cabeçalho (se a coluna C começar com letra, assume header)
      const primeira = rows[0];
      const temCabecalho = primeira && String(primeira[2] || '').match(/[a-zA-Zçã]/);
      const linhasUteis = temCabecalho ? rows.slice(1) : rows;

      const errosArq = [];
      const validas = [];
      const codigosVistos = new Set();
      linhasUteis.forEach((row, idx) => {
        if (!row || row.every(c => c === '' || c == null)) return;
        const ln = (temCabecalho ? idx + 2 : idx + 1);
        const codigoRaw  = String(row[1] || '').trim();  // B
        const nome       = String(row[2] || '').trim();  // C
        const codigoGVRw = String(row[3] || '').trim();  // D
        const nomeGV     = String(row[4] || '').trim();  // E
        // Normaliza códigos: remove zeros à esquerda mas mantém ao menos 1 dígito
        const codigo   = codigoRaw.replace(/^0+(?=\d)/, '');
        const codigoGV = codigoGVRw.replace(/^0+(?=\d)/, '');
        if (!codigo) { errosArq.push(`Linha ${ln}: código vazio (coluna B)`); return; }
        if (!nome)   { errosArq.push(`Linha ${ln}: nome do RN vazio (coluna C, código ${codigo})`); return; }
        if (codigosVistos.has(codigo)) {
          errosArq.push(`Linha ${ln}: código ${codigo} duplicado no arquivo`);
          return;
        }
        codigosVistos.add(codigo);
        validas.push({ codigo, nome, codigoGV, nomeGV });
      });

      setErros(errosArq);
      if (validas.length === 0) {
        setMessage(errosArq.length ? `❌ ${errosArq.length} erro(s) e nenhuma linha válida.` : '❌ Nenhuma linha válida encontrada.');
        return;
      }

      setLinhasValidas(validas);
      setPreview(validas.slice(0, 10));
      const partes = [];
      if (errosArq.length) partes.push(`⚠️ ${errosArq.length} linha(s) com erro serão IGNORADAS`);
      partes.push(`✅ ${validas.length} vendedor(es) válido(s)`);
      setMessage(partes.join(' · '));
    } catch (e) {
      setMessage(`❌ Erro ao ler arquivo: ${e.message}`);
    }
  }

  async function importar() {
    if (!isSupervisor) return;
    if (linhasValidas.length === 0) return;
    setLoading(true);
    setMessage('⏳ Importando...');
    try {
      const CHUNK = 400;
      let total = 0;
      for (let i = 0; i < linhasValidas.length; i += CHUNK) {
        const wb = writeBatch(db);
        linhasValidas.slice(i, i + CHUNK).forEach(l => {
          wb.set(docRef('vendedores', l.codigo), {
            codigo:    l.codigo,
            nome:      l.nome,
            codigoGV:  l.codigoGV || '',
            nomeGV:    l.nomeGV   || '',
            atualizadoEm: serverTimestamp(),
            ...stamp(),
          });
        });
        await wb.commit();
        total += Math.min(CHUNK, linhasValidas.length - i);
      }
      setMessage(`✅ ${total} vendedor(es) atualizado(s).`);
      setArquivo(null); setLinhasValidas([]); setPreview([]); setErros([]);
      carregarExistentes();
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function excluirTodos() {
    if (!isSupervisor) return;
    if (!window.confirm('Excluir TODOS os vendedores cadastrados? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      const snap = await getDocs(col('vendedores'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const wb = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => wb.delete(d.ref));
        await wb.commit();
      }
      setMessage('✅ Todos os vendedores foram removidos.');
      carregarExistentes();
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function excluirUm(codigo) {
    if (!isSupervisor) return;
    if (!window.confirm(`Remover vendedor ${codigo}?`)) return;
    try {
      await deleteDoc(docRef('vendedores', codigo));
      carregarExistentes();
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    }
  }

  const existentesFiltrados = existentes.filter(e => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (
      String(e.codigo).includes(q) ||
      String(e.nome     || '').toLowerCase().includes(q) ||
      String(e.codigoGV || '').includes(q) ||
      String(e.nomeGV   || '').toLowerCase().includes(q)
    );
  });

  return (
    <PageContainer maxWidth={1100}>
      <PageHeader
        kicker="Cadastros"
        titulo="Importar Vendedores (01.02.46)"
        sub="Mapeamento código → nome do RN (Representante de Negócio). Usado em Reposição, WQI, Troca e demais telas que exibem vendedor."
      />

      {message && (
        <div style={{
          padding: '10px 14px', marginBottom: '14px', borderRadius: 8,
          backgroundColor: message.includes('✅') ? D.greenSoft : message.includes('⏳') ? D.blueSoft : D.redSoft,
          color: message.includes('✅') ? D.green : message.includes('⏳') ? D.blue : D.red,
          borderLeft: `4px solid ${message.includes('✅') ? D.green : message.includes('⏳') ? D.blue : D.red}`,
          fontSize: 13,
        }}>{message}</div>
      )}

      {erros.length > 0 && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 8,
          backgroundColor: D.redSoft, border: `1px solid ${D.redBorder}`,
          maxHeight: 200, overflowY: 'auto',
        }}>
          <div style={{ color: D.red, fontWeight: 700, marginBottom: 6 }}>
            ⚠️ {erros.length} linha(s) com erro {linhasValidas.length > 0 ? '— serão ignoradas' : ''}:
          </div>
          {erros.map((e, i) => <div key={i} style={{ color: D.red, fontSize: 12, marginBottom: 3 }}>• {e}</div>)}
        </div>
      )}

      {isSupervisor && (
        <div style={{
          background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
          padding: 20, marginBottom: 20, boxShadow: D.shadow,
        }}>
          <h3 style={{ margin: 0, marginBottom: 12, color: D.red, fontSize: 14 }}>Importar arquivo</h3>
          <label style={{
            display: 'block', padding: 16, border: `2px dashed ${D.red}`, borderRadius: 8,
            cursor: 'pointer', background: D.redSoft, marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: D.red, marginBottom: 6 }}>
              📂 Selecione um arquivo (CSV ou Excel)
            </div>
            <div style={{ fontSize: 12, color: D.textSec }}>
              Colunas: <strong>B=Código</strong> · <strong>C=Nome do RN</strong> · <strong>D=Código GV</strong> · <strong>E=Nome do GV</strong>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={processarArquivo} style={{ display: 'none' }} />
          </label>

          {arquivo && <div style={{ fontSize: 12, color: D.textMuted, marginBottom: 10 }}>📄 {arquivo.name}</div>}

          {preview.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Preview ({preview.length} primeiras):</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Código</th>
                    <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Nome do RN</th>
                    <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Cód. GV</th>
                    <th style={{ ...tdStyle, color: D.text, fontWeight: 700 }}>Nome do GV</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{l.codigo}</td>
                      <td style={tdStyle}>{l.nome}</td>
                      <td style={{ ...tdStyle, fontFamily: D.mono }}>{l.codigoGV || '—'}</td>
                      <td style={tdStyle}>{l.nomeGV || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {linhasValidas.length > 0 && (
            <button onClick={importar} disabled={loading} style={{
              padding: '10px 20px', background: D.red, color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
            }}>
              {loading ? '⏳ Importando...' : `✅ Importar ${linhasValidas.length} vendedor(es)`}
            </button>
          )}
        </div>
      )}

      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: 20, boxShadow: D.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, color: D.red, fontSize: 14 }}>
            Vendedores cadastrados ({existentes.length})
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar código, nome do RN ou GV..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ ...sInput, minWidth: 240 }}
            />
            {isSupervisor && existentes.length > 0 && (
              <button onClick={excluirTodos} disabled={loading} style={{
                padding: '7px 14px', background: 'transparent', color: D.red,
                border: `1px solid ${D.redBorder}`, borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}>Apagar todos</button>
            )}
          </div>
        </div>

        {existentes.length === 0 ? (
          <EmptyState titulo="Nenhum vendedor cadastrado" descricao="Importe o relatório 01.02.46 para começar." />
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Código</th>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nome do RN</th>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Cód. GV</th>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nome do GV</th>
                  {isSupervisor && <th style={{ background: D.text, color: '#fff', padding: '8px 10px', fontWeight: 600 }}></th>}
                </tr>
              </thead>
              <tbody>
                {existentesFiltrados.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 ? D.bg : '#fff' }}>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{e.codigo}</td>
                    <td style={tdStyle}>{e.nome || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono }}>{e.codigoGV || '—'}</td>
                    <td style={tdStyle}>{e.nomeGV || '—'}</td>
                    {isSupervisor && (
                      <td style={tdStyle}>
                        <button onClick={() => excluirUm(e.codigo)} style={{
                          padding: '4px 10px', background: 'transparent', color: D.red,
                          border: `1px solid ${D.redBorder}33`, borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        }}>Remover</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
