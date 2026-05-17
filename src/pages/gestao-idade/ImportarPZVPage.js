/**
 * Importar PZV (Prazo de Validade Total) por produto.
 *
 * Formato esperado (Excel/CSV):
 *   A = Código do Produto
 *   B = PZV (em dias)
 *   (C, D... colunas extras são ignoradas)
 *
 * Grava em `pzv_produtos/{codigo}` = { codigo, pzvDias, atualizadoEm }.
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
import { GestaoIdadeTabs } from '../../modules/gestao-idade/GestaoIdadeTabs';
import { PZV_PADRAO_DIAS } from '../../modules/gestao-idade/gestaoIdadeHelpers';

export default function ImportarPZVPage() {
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
      const snap = await getDocs(col('pzv_produtos'));
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

      // 1ª linha pode ser cabeçalho
      const primeira = rows[0];
      const temCabecalho = primeira && String(primeira[0] || '').match(/[a-zA-Zçã]/);
      const linhasUteis = temCabecalho ? rows.slice(1) : rows;

      const errosArq = [];
      const validas = [];
      linhasUteis.forEach((row, idx) => {
        if (!row || row.every(c => c === '' || c == null)) return;
        const ln = (temCabecalho ? idx + 2 : idx + 1);
        const codigo = String(row[0] || '').trim();
        const pzv = parseInt(row[1], 10);
        if (!codigo) { errosArq.push(`Linha ${ln}: código vazio`); return; }
        if (!Number.isFinite(pzv) || pzv <= 0 || pzv > 3650) {
          errosArq.push(`Linha ${ln}: PZV inválido "${row[1]}" (deve ser número de dias entre 1 e 3650)`);
          return;
        }
        validas.push({ codigo, pzvDias: pzv });
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
      partes.push(`✅ ${validas.length} produto(s) com PZV válido`);
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
          wb.set(docRef('pzv_produtos', l.codigo), {
            codigo: l.codigo,
            pzvDias: l.pzvDias,
            atualizadoEm: serverTimestamp(),
            ...stamp(),
          });
        });
        await wb.commit();
        total += Math.min(CHUNK, linhasValidas.length - i);
      }
      setMessage(`✅ ${total} produto(s) atualizado(s).`);
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
    if (!window.confirm('Excluir TODOS os PZVs cadastrados? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      const snap = await getDocs(col('pzv_produtos'));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const wb = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => wb.delete(d.ref));
        await wb.commit();
      }
      setMessage('✅ Todos os PZVs foram removidos.');
      carregarExistentes();
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function excluirUm(codigo) {
    if (!isSupervisor) return;
    if (!window.confirm(`Remover PZV do produto ${codigo}?`)) return;
    try {
      await deleteDoc(docRef('pzv_produtos', codigo));
      carregarExistentes();
    } catch (e) {
      setMessage(`❌ Erro: ${e.message}`);
    }
  }

  const existentesFiltrados = existentes.filter(e => {
    if (!busca.trim()) return true;
    return String(e.codigo).includes(busca.trim());
  });

  return (
    <PageContainer maxWidth={1100}>
      <PageHeader
        kicker="Gestão de Idade"
        titulo="Importar PZV"
        sub="Prazo de Validade Total (em dias) por código de produto. Usado nos cálculos de Shelf Life e Stock Age Index."
      />
      <GestaoIdadeTabs />

      {/* Info de comportamento padrão */}
      <div style={{
        padding: '10px 14px', marginBottom: '14px', borderRadius: 8,
        backgroundColor: D.blueSoft, border: `1px solid ${D.blueBorder}`,
        color: D.blue, fontSize: 12.5, lineHeight: 1.6,
      }}>
        <strong>Como funciona:</strong>
        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
          <li>Produtos <strong>sem PZV cadastrado</strong> usam o padrão de <strong>{PZV_PADRAO_DIAS} dias</strong> nos cálculos de Shelf Life.</li>
          <li>Ao importar um novo arquivo, produtos <strong>já cadastrados</strong> têm o PZV <strong>substituído</strong> pelo novo valor (último importado vence).</li>
          <li>Produtos não presentes no novo arquivo <strong>mantêm o valor anterior</strong> — só sai do cadastro via "Remover" ou "Apagar todos".</li>
        </ul>
      </div>

      {!isSupervisor && (
        <div style={{
          padding: '10px 14px', marginBottom: '12px', borderRadius: 8,
          backgroundColor: D.amberSoft, border: `1px solid ${D.amberBorder}`,
          color: D.amber, fontSize: 12.5,
        }}>
          ⚠️ Você está visualizando os PZVs cadastrados. A edição é restrita a supervisores.
        </div>
      )}

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
              Colunas: <strong>A=Código</strong> · <strong>B=PZV (dias)</strong>
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
                    <th style={{ ...tdStyle, color: D.text, fontWeight: 700, textAlign: 'right' }}>PZV (dias)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{l.codigo}</td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{l.pzvDias}</td>
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
              {loading ? '⏳ Importando...' : `✅ Importar ${linhasValidas.length} produto(s)`}
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
            PZVs cadastrados ({existentes.length})
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ ...sInput, minWidth: 200 }}
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
          <EmptyState titulo="Nenhum PZV cadastrado" descricao="Importe um arquivo CSV/Excel para começar." />
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Código</th>
                  <th style={{ background: D.text, color: '#fff', padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>PZV (dias)</th>
                  {isSupervisor && <th style={{ background: D.text, color: '#fff', padding: '8px 10px', fontWeight: 600 }}></th>}
                </tr>
              </thead>
              <tbody>
                {existentesFiltrados.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 ? D.bg : '#fff' }}>
                    <td style={{ ...tdStyle, fontFamily: D.mono, fontWeight: 700 }}>{e.codigo}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, textAlign: 'right' }}>{e.pzvDias}</td>
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
