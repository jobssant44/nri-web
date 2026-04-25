import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import * as XLSX from 'xlsx';

export default function ColetasValidadePage() {
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [tipoDetectado, setTipoDetectado] = useState('');
  const [filtrosAplicados, setFiltrosAplicados] = useState({});

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
  };

  const contentStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '20px',
  };

  const inputStyle = {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
  };

  const dataInputStyle = {
    ...inputStyle,
    width: '130px',
  };

  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: '#E31837',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '8px',
    fontSize: '13px',
  };

  const buttonSecundarioStyle = {
    padding: '10px 16px',
    backgroundColor: '#1D5A9E',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '8px',
    fontSize: '13px',
  };

  const exportButtonStyle = {
    padding: '10px 20px',
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '8px',
    fontSize: '13px',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
  };

  const thStyle = {
    backgroundColor: '#E31837',
    color: 'white',
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
    fontSize: '12px',
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #ddd',
    fontSize: '12px',
  };

  // ========== DETECÇÃO AUTOMÁTICA DE TIPO ==========

  function detectarTipo(texto) {
    if (!texto.trim()) return '';

    const texto_limpo = texto.trim();

    // Padrão de data: DD/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto_limpo)) {
      return 'data';
    }

    // Padrão de área: 1 letra maiúscula (A-Z)
    if (/^[A-Z]$/.test(texto_limpo.toUpperCase())) {
      return 'area';
    }

    // Padrão de rua: número de 1-3 dígitos
    if (/^\d{1,3}$/.test(texto_limpo)) {
      return 'rua';
    }

    // Se contém números e tem tamanho curto, provavelmente código do produto
    if (/^\d+$/.test(texto_limpo) && texto_limpo.length <= 5) {
      return 'codigo';
    }

    // Se contém letras, provavelmente é nome do produto
    if (/[a-zA-Z]/i.test(texto_limpo)) {
      return 'nome';
    }

    return 'desconhecido';
  }

  // ========== CONVERTER DATA ==========

  function formatarDataInput(valor) {
    const digits = valor.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function parseDataBR(dataStr) {
    if (!dataStr) return null;
    const match = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, dia, mes, ano] = match;
    return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
  }

  function formatarDataBR(data) {
    if (!data) return '';
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  // ========== BUSCA COM MÚLTIPLOS FILTROS ==========

  async function buscar() {
    const temBuscaTexto = filtro.trim();
    const temDataInicio = dataInicio.trim();
    const temDataFim = dataFim.trim();

    if (!temBuscaTexto && !temDataInicio && !temDataFim) {
      setMensagem('❌ Digite algo para buscar ou selecione um intervalo de datas');
      return;
    }

    setLoading(true);
    setMensagem('');
    setResultados([]);
    setTipoDetectado('');

    try {
      const snap = await getDocs(collection(db, 'inventory_logs'));
      let resultadosFiltrados = snap.docs.map(doc => doc.data());

      // ========== FILTRO 1: BUSCA TEXTUAL ==========
      if (temBuscaTexto) {
        const tipo = detectarTipo(filtro);
        setTipoDetectado(tipo);

        if (tipo === 'codigo') {
          resultadosFiltrados = resultadosFiltrados.filter(data => {
            const codigo = (data.productCode || data.productId || '').toString();
            return codigo === filtro.trim();
          });
        } else if (tipo === 'nome') {
          const textoBuscado = filtro.trim().toLowerCase();
          resultadosFiltrados = resultadosFiltrados.filter(data => {
            const nome = (data.productName || '').toLowerCase();
            return nome.includes(textoBuscado);
          });
        } else if (tipo === 'data') {
          resultadosFiltrados = resultadosFiltrados.filter(data => {
            if (!data.expiryDate) return false;
            const dataStr = data.expiryDate instanceof Date
              ? data.expiryDate.toLocaleDateString('pt-BR')
              : String(data.expiryDate);
            return dataStr === filtro.trim();
          });
        } else if (tipo === 'area') {
          const areaFiltro = filtro.trim().toUpperCase();
          resultadosFiltrados = resultadosFiltrados.filter(data => data.area === areaFiltro);
        } else if (tipo === 'rua') {
          const ruaFiltro = parseInt(filtro.trim());
          resultadosFiltrados = resultadosFiltrados.filter(data => data.street === ruaFiltro);
        }
      }

      // ========== FILTRO 2: INTERVALO DE DATAS (por data de LANÇAMENTO) ==========
      if (temDataInicio || temDataFim) {
        const dataInicioParsed = temDataInicio ? parseDataBR(temDataInicio) : null;
        const dataFimParsed = temDataFim ? parseDataBR(temDataFim) : null;

        // Validar se as datas foram parseadas corretamente
        if (
          (temDataInicio && !dataInicioParsed) ||
          (temDataFim && !dataFimParsed)
        ) {
          setMensagem('❌ Formato de data inválido. Use DD/MM/AAAA');
          setLoading(false);
          return;
        }

        resultadosFiltrados = resultadosFiltrados.filter(data => {
          // Se não tiver data de lançamento, usar timestamp como fallback
          let dataLancamento = data.createdAt || data.timestamp;
          if (!dataLancamento) return false;

          // Converter para Date se necessário
          if (!(dataLancamento instanceof Date)) {
            // Se é timestamp do Firestore
            if (dataLancamento && typeof dataLancamento.toDate === 'function') {
              dataLancamento = dataLancamento.toDate();
            } else {
              const dataStr = String(dataLancamento);
              const match = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (match) {
                const [, dia, mes, ano] = match;
                dataLancamento = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
              } else {
                return false;
              }
            }
          }

          // Comparar apenas as datas (sem considerar horas)
          const dataLancamentoComparar = new Date(dataLancamento.getFullYear(), dataLancamento.getMonth(), dataLancamento.getDate());

          if (dataInicioParsed) {
            const dataInicioComparar = new Date(dataInicioParsed.getFullYear(), dataInicioParsed.getMonth(), dataInicioParsed.getDate());
            if (dataLancamentoComparar < dataInicioComparar) return false;
          }

          if (dataFimParsed) {
            const dataFimComparar = new Date(dataFimParsed.getFullYear(), dataFimParsed.getMonth(), dataFimParsed.getDate());
            if (dataLancamentoComparar > dataFimComparar) return false;
          }

          return true;
        });
      }

      // ========== ORDENAR RESULTADOS ==========
      resultadosFiltrados.sort((a, b) => {
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        if (a.street !== b.street) return a.street - b.street;
        return (a.palettePosition || 0) - (b.palettePosition || 0);
      });

      // ========== GERAR MENSAGEM ==========
      if (resultadosFiltrados.length === 0) {
        let msgErro = '❌ Nenhum registro encontrado ';
        if (temBuscaTexto && (temDataInicio || temDataFim)) {
          msgErro += 'com os filtros aplicados';
        } else if (temBuscaTexto) {
          msgErro += `para "${filtro}"`;
        } else {
          msgErro += `no período de ${temDataInicio || 'início'} a ${temDataFim || 'fim'}`;
        }
        setMensagem(msgErro);
      } else {
        setMensagem(`✅ ${resultadosFiltrados.length} registro(s) encontrado(s)`);
      }

      setResultados(resultadosFiltrados);
      setFiltrosAplicados({
        busca: temBuscaTexto,
        tipo: tipoDetectado,
        dataInicio: temDataInicio,
        dataFim: temDataFim,
      });
    } catch (error) {
      setMensagem(`❌ Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ========== LIMPAR FILTROS ==========

  function limparFiltros() {
    setFiltro('');
    setDataInicio('');
    setDataFim('');
    setResultados([]);
    setMensagem('');
    setTipoDetectado('');
    setFiltrosAplicados({});
  }

  // ========== EXPORTAR PARA EXCEL ==========

  async function exportarParaExcel() {
    if (resultados.length === 0) {
      setMensagem('❌ Nenhum resultado para exportar');
      return;
    }

    try {
      const resolverTs = (v) => {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate();
        if (v instanceof Date) return v;
        return null;
      };
      const dados = resultados.map(data => ({
        'Código': data.productCode || data.productId || '',
        'Produto': data.productName || '',
        'Validade': (() => { const d = resolverTs(data.expiryDate); return d ? d.toLocaleDateString('pt-BR') : String(data.expiryDate || ''); })(),
        'Área': data.area || '',
        'Rua': data.street || '',
        'Posição': data.palettePosition || '',
        'Conferente': data.conferente || '',
        'Data Contagem': (() => { const d = resolverTs(data.timestamp || data.createdAt); return d ? d.toLocaleDateString('pt-BR') : ''; })(),
      }));

      const ws = XLSX.utils.json_to_sheet(dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Coletas');

      // Auto-ajustar largura das colunas
      const colWidths = [12, 25, 12, 8, 6, 8, 15, 15];
      ws['!cols'] = colWidths.map(width => ({ wch: width }));

      const nomeArquivo = `Coletas_${new Date().getTime()}.xlsx`;
      XLSX.writeFile(wb, nomeArquivo);
      setMensagem(`✅ Arquivo "${nomeArquivo}" exportado com ${resultados.length} registros!`);

      setTimeout(() => setMensagem(''), 3000);
    } catch (error) {
      setMensagem(`❌ Erro ao exportar: ${error.message}`);
    }
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ color: '#E31837', marginBottom: '10px' }}>🔍 Coletas de Validade</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Busque por: <strong>código</strong>, <strong>nome do produto</strong>, <strong>data</strong>, <strong>área</strong> ou <strong>rua</strong>
        <br />
        Combine com filtro de intervalo de datas para resultados mais precisos
      </p>

      <div style={contentStyle}>
        {/* ========== LINHA 1: BUSCA TEXTUAL ========== */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Ex: 1695 | Cerveja | 15/08/2026 | U | 35"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && buscar()}
            disabled={loading}
            style={{ ...inputStyle, minWidth: '350px' }}
          />
          <button style={buttonStyle} onClick={buscar} disabled={loading}>
            {loading ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
        </div>

        {/* ========== LINHA 2: FILTRO DE DATA (por data de LANÇAMENTO) ========== */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>📅 Filtrar data:</label>
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            value={dataInicio}
            onChange={(e) => setDataInicio(formatarDataInput(e.target.value))}
            disabled={loading}
            style={dataInputStyle}
            title="Data de início (dd/mm/aaaa)"
          />
          <span style={{ fontSize: '12px', color: '#666' }}>até</span>
          <input
            type="text"
            placeholder="dd/mm/aaaa"
            value={dataFim}
            onChange={(e) => setDataFim(formatarDataInput(e.target.value))}
            disabled={loading}
            style={dataInputStyle}
            title="Data de fim (dd/mm/aaaa)"
          />
          <button style={buttonSecundarioStyle} onClick={buscar} disabled={loading}>
            ⏳ Aplicar
          </button>
          <button
            onClick={limparFiltros}
            style={{
              padding: '10px 16px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '13px',
            }}
            disabled={loading}
          >
            🔄 Limpar
          </button>
        </div>

        {/* ========== RESUMO DE FILTROS APLICADOS ========== */}
        {(filtrosAplicados.busca || filtrosAplicados.dataInicio || filtrosAplicados.dataFim) && (
          <div
            style={{
              padding: '10px 12px',
              marginBottom: '15px',
              backgroundColor: '#e3f2fd',
              color: '#1d5a9e',
              borderRadius: '4px',
              fontSize: '12px',
              borderLeft: '4px solid #1d5a9e',
            }}
          >
            🎯 <strong>Filtros aplicados:</strong>
            {filtrosAplicados.busca && ` Busca: "${filtrosAplicados.busca}" (${filtrosAplicados.tipo})`}
            {filtrosAplicados.busca && (filtrosAplicados.dataInicio || filtrosAplicados.dataFim) && ' | '}
            {(filtrosAplicados.dataInicio || filtrosAplicados.dataFim) && `Período: ${filtrosAplicados.dataInicio || 'início'} a ${filtrosAplicados.dataFim || 'fim'}`}
          </div>
        )}

        {/* ========== TIPO DETECTADO ========== */}
        {tipoDetectado && filtrosAplicados.busca && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '15px',
              backgroundColor: '#fff3cd',
              color: '#856404',
              borderRadius: '4px',
              fontSize: '12px',
              fontStyle: 'italic',
              borderLeft: '4px solid #ffc107',
            }}
          >
            💡 Tipo detectado: <strong>
              {tipoDetectado === 'codigo' && 'Código do Produto'}
              {tipoDetectado === 'nome' && 'Nome do Produto'}
              {tipoDetectado === 'data' && 'Data de Validade'}
              {tipoDetectado === 'area' && 'Área'}
              {tipoDetectado === 'rua' && 'Rua'}
              {tipoDetectado === 'desconhecido' && 'Desconhecido'}
            </strong>
          </div>
        )}

        {/* ========== MENSAGENS ========== */}
        {mensagem && (
          <div
            style={{
              padding: '12px',
              marginBottom: '15px',
              borderRadius: '4px',
              backgroundColor: mensagem.includes('✅') ? '#dcfce7' : '#fee2e2',
              color: mensagem.includes('✅') ? '#166534' : '#991b1b',
              borderLeft: `4px solid ${mensagem.includes('✅') ? '#22c55e' : '#ef4444'}`,
              fontSize: '13px',
            }}
          >
            {mensagem}
          </div>
        )}

        {/* ========== TABELA DE RESULTADOS ========== */}
        {resultados.length > 0 && (
          <>
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>
                📊 {resultados.length} registro(s)
              </span>
              <button style={exportButtonStyle} onClick={exportarParaExcel}>
                📥 Exportar para Excel
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>Validade</th>
                    <th style={thStyle}>Área</th>
                    <th style={thStyle}>Rua</th>
                    <th style={thStyle}>Posição</th>
                    <th style={thStyle}>Conferente</th>
                    <th style={thStyle}>Data Contagem</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((res, idx) => {
                    const resolverTimestamp = (v) => {
                      if (!v) return null;
                      if (typeof v.toDate === 'function') return v.toDate();
                      if (v instanceof Date) return v;
                      return null;
                    };
                    const dtValidade = resolverTimestamp(res.expiryDate);
                    const dataValidade = dtValidade
                      ? dtValidade.toLocaleDateString('pt-BR')
                      : String(res.expiryDate || '');
                    const dtContagem = resolverTimestamp(res.timestamp || res.createdAt);
                    const dataContagem = dtContagem ? dtContagem.toLocaleDateString('pt-BR') : '';

                    return (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                        <td style={tdStyle}><strong>{res.productCode || res.productId || ''}</strong></td>
                        <td style={tdStyle}>{res.productName || ''}</td>
                        <td style={tdStyle}>{dataValidade}</td>
                        <td style={tdStyle}>{res.area || ''}</td>
                        <td style={tdStyle}>{res.street || ''}</td>
                        <td style={tdStyle}>{res.palettePosition || ''}</td>
                        <td style={tdStyle}>{res.conferente || ''}</td>
                        <td style={tdStyle}>{dataContagem}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {resultados.length === 0 && !mensagem && (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '30px' }}>
            👇 Faça uma busca ou selecione um intervalo de datas
          </p>
        )}
      </div>
    </div>
  );
}
