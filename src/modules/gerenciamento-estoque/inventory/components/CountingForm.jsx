/**
 * CountingForm - Formulário para registrar uma contagem de inventário (Versão Melhorada)
 *
 * Fluxo:
 * 1. Usuário seleciona Área
 * 2. Usuário digita Rua e Posição → validação contra DB
 * 3. Usuário digita Código do Produto ou Nome → autocomplete, preenchimento automático, sincronização
 * 4. Validação cruzada: Código ↔ Nome
 * 5. Data com auto-formatação DD/MM/AAAA
 * 6. Opcionalmente marca checkbox para repetir em todas as posições da rua
 * 7. Clica "Adicionar novo produto" ou "Registrar" quando terminar
 * 8. Dados salvos no Firebase
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

const initialFormState = {
  area: '',
  street: '',
  palettePosition: '',
  productCode: '',
  productName: '',
  expiryDate: '',
  repeatForAllPositions: false,
};

export function CountingForm({ conferente, onSuccess, onError }) {
  const [form, setForm] = useState(initialFormState);
  const [areas, setAreas] = useState([]);
  const [produtos, setProdutosDB] = useState([]); // Base de produtos
  const [locationAssignments, setLocationAssignments] = useState({}); // productCode → locationId
  const [curvaMap, setCurvaMap] = useState({}); // productCode → curva
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [produtosQueueados, setProdutosQueueados] = useState([]); // Fila de produtos a registrar

  // Validações e erros
  const [erros, setErros] = useState({});

  // Autocomplete de produtos por nome
  const [sugestoesNome, setSugestoesNome] = useState([]);
  const [mostrarSugestoesNome, setMostrarSugestoesNome] = useState(false);

  const containerStyle = {
    maxWidth: '700px',
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const formGroupStyle = { marginBottom: '15px' };
  const labelStyle = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
    color: '#333',
  };
  const inputStyle = {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontSize: '14px',
  };
  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: '#E31837',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginRight: '10px',
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
  };

  const tdStyle = {
    padding: '12px',
    borderBottom: '1px solid #ddd',
  };

  // Carregar áreas e produtos ao montar
  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoadingAreas(true);
    try {
      const [locationsSnap, produtosSnap, curvaSnap] = await Promise.all([
        getDocs(collection(db, 'locations')),
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'curva_abc')),
      ]);

      // Áreas disponíveis + mapa de localização por produto
      const areasSet = new Set();
      const assignments = {};
      locationsSnap.docs.forEach((d) => {
        const loc = d.data();
        if (loc.area) areasSet.add(loc.area);
        if (loc.assignedSkuId) {
          assignments[String(loc.assignedSkuId)] = d.id; // ex: "A-1-5"
        }
      });
      setAreas(Array.from(areasSet).sort());
      setLocationAssignments(assignments);

      // Base de produtos
      setProdutosDB(produtosSnap.docs.map(doc => ({
        codigo: doc.data().codigo,
        nome: doc.data().nome,
      })));

      // Mapa de curva ABC
      const curvas = {};
      curvaSnap.docs.forEach(d => {
        const { codigo, curva } = d.data();
        if (codigo) curvas[String(codigo)] = curva || null;
      });
      setCurvaMap(curvas);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoadingAreas(false);
    }
  }

  // ========== VALIDAÇÕES ==========

  // Buscar produto por código
  function buscarProdutoPorCodigo(codigo) {
    return produtos.find(p => p.codigo === codigo);
  }

  // Validar localização (Area + Street + Position)
  async function validarLocalizacao(area, street, palettePosition) {
    try {
      const locationId = `${area}-${street}-${palettePosition}`;
      const snap = await getDocs(collection(db, 'locations'));
      const existe = snap.docs.some(doc => doc.id === locationId);
      return existe;
    } catch (error) {
      console.error('Erro ao validar localização:', error);
      return false;
    }
  }

  // Auto-formatar data DD/MM/AAAA
  function formatarData(valor) {
    // Remove caracteres não-numéricos
    const apenas_numeros = valor.replace(/\D/g, '');

    if (apenas_numeros.length === 0) return '';
    if (apenas_numeros.length <= 2) return apenas_numeros;
    if (apenas_numeros.length <= 4) return `${apenas_numeros.slice(0, 2)}/${apenas_numeros.slice(2)}`;
    return `${apenas_numeros.slice(0, 2)}/${apenas_numeros.slice(2, 4)}/${apenas_numeros.slice(4, 8)}`;
  }

  // Validar formato de data
  function validarFormatoData(dateStr) {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (isNaN(date.getTime())) return null;
    return date;
  }

  function parseDate(dateStr) {
    return validarFormatoData(dateStr);
  }

  // Gerar sugestões de produtos por nome
  function gerarSugestoesNome(texto) {
    if (!texto.trim()) return [];
    const textoBaixo = texto.toLowerCase();
    return produtos
      .filter(p => p.nome.toLowerCase().includes(textoBaixo))
      .slice(0, 10);
  }

  // Validar formulário completo
  function validarFormulario() {
    const novosErros = {};

    if (!form.area.trim()) novosErros.area = 'Área é obrigatória';
    if (!form.street.trim()) novosErros.street = 'Rua é obrigatória';
    if (!form.palettePosition.trim()) novosErros.palettePosition = 'Posição Palete é obrigatória';

    // Validar código do produto
    if (!form.productCode.trim()) {
      novosErros.productCode = 'Código do Produto é obrigatório';
    } else {
      const prodEncontrado = buscarProdutoPorCodigo(form.productCode.trim());
      if (!prodEncontrado) {
        novosErros.productCode = 'Código do produto não existe na base de dados';
      } else if (form.productName && form.productName !== prodEncontrado.nome) {
        novosErros.productName = 'Nome não corresponde ao código selecionado';
      }
    }

    // Validar nome do produto se preenchido
    if (form.productName && !form.productCode) {
      novosErros.productName = 'Selecione um produto da lista';
    }

    // Validar data
    if (!form.expiryDate.trim()) {
      novosErros.expiryDate = 'Data de Validade é obrigatória';
    } else {
      const dataParsed = validarFormatoData(form.expiryDate);
      if (!dataParsed) {
        novosErros.expiryDate = 'Data inválida (use DD/MM/AAAA)';
      }
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleAdicionarProduto(e) {
    e.preventDefault();
    setMessage('');
    setErros({});

    // Validar formulário
    if (!validarFormulario()) {
      return; // erros já foram setados
    }

    // Validar localização contra o banco
    const localizacaoValida = await validarLocalizacao(
      form.area,
      parseInt(form.street),
      parseInt(form.palettePosition)
    );

    if (!localizacaoValida) {
      setErros(prev => ({
        ...prev,
        localizacao: `❌ Localização ${form.area}-${form.street}-${form.palettePosition} não está cadastrada`
      }));
      setMessage(`❌ A localização ${form.area}-${form.street}-${form.palettePosition} não existe no banco de dados. Cadastre-a em "Gerenciar Localizações" primeiro.`);
      return;
    }

    // Tudo validado, adicionar à fila
    const produtoEncontrado = buscarProdutoPorCodigo(form.productCode);
    const novoProduto = {
      area: form.area,
      street: parseInt(form.street),
      palettePosition: parseInt(form.palettePosition),
      productCode: form.productCode,
      productName: produtoEncontrado?.nome || form.productName,
      expiryDate: form.expiryDate,
      repeatForAllPositions: form.repeatForAllPositions,
    };

    setProdutosQueueados([...produtosQueueados, novoProduto]);

    // Limpar apenas Rua, Posição, Código e Data - MANTER Área
    setForm({
      ...form,
      street: '',
      palettePosition: '',
      productCode: '',
      productName: '',
      expiryDate: '',
      repeatForAllPositions: false,
    });

    setMostrarSugestoesNome(false);
    setSugestoesNome([]);

    setMessage(`✅ Produto ${novoProduto.productCode} adicionado à fila`);
    setTimeout(() => setMessage(''), 2000);
  }

  async function handleRegistrarTudo(e) {
    e.preventDefault();
    if (produtosQueueados.length === 0) {
      setMessage('❌ Adicione pelo menos um produto');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      let count = 0;

      for (const prod of produtosQueueados) {
        const locations = [];

        if (prod.repeatForAllPositions) {
          // Buscar todas as posições desta rua/área
          const snap = await getDocs(collection(db, 'locations'));
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.area === prod.area && data.street === prod.street) {
              locations.push({
                area: data.area,
                street: data.street,
                palettePosition: data.palettePosition,
              });
            }
          });
        } else {
          // Apenas uma posição
          locations.push({
            area: prod.area,
            street: prod.street,
            palettePosition: prod.palettePosition,
          });
        }

        // Salvar cada contagem
        for (const loc of locations) {
          const locationId = `${loc.area}-${loc.street}-${loc.palettePosition}`;

          await addDoc(collection(db, 'inventory_logs'), {
            area: loc.area,
            street: loc.street,
            palettePosition: loc.palettePosition,
            locationId: locationId,
            productCode: prod.productCode,
            productName: prod.productName,
            expiryDate: parseDate(prod.expiryDate),
            conferente: conferente || 'Conferente',
            timestamp: new Date(),
            notes: '',
            // Snapshots para integridade histórica
            assignedLocation: locationAssignments[String(prod.productCode)] || null,
            productCurva: curvaMap[String(prod.productCode)] || null,
          });

          count++;
        }
      }

      setMessage(`✅ ${count} contagem(ns) registrada(s) com sucesso!`);
      setProdutosQueueados([]);
      setForm(initialFormState);
      setErros({});
      onSuccess?.({ count });

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`❌ Erro ao registrar: ${error.message}`);
      onError?.(error);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRemoverProduto(idx) {
    setProdutosQueueados(produtosQueueados.filter((_, i) => i !== idx));
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#E31837', marginBottom: '20px' }}>📝 Registrar Contagem</h2>

      {message && (
        <div
          style={{
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '4px',
            backgroundColor: message.includes('✅') ? '#dcfce7' : '#fee2e2',
            color: message.includes('✅') ? '#166534' : '#991b1b',
            borderLeft: `4px solid ${message.includes('✅') ? '#22c55e' : '#ef4444'}`,
          }}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleAdicionarProduto}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>📍 Área</label>
          <select
            style={inputStyle}
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            disabled={loadingAreas || submitting}
          >
            <option value="">-- Selecionar Área --</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>🛣️ Rua (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 35..."
            value={form.street}
            onChange={(e) =>
              setForm({ ...form, street: e.target.value.replace(/\D/g, '') })
            }
            disabled={submitting}
            style={{...inputStyle, borderColor: erros.street ? '#e31837' : '#ddd'}}
          />
          {erros.street && <div style={{ color: '#e31837', fontSize: '12px', marginTop: '4px' }}>❌ {erros.street}</div>}
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📦 Posição Palete (número)</label>
          <input
            type="text"
            placeholder="Ex: 1, 2, 209..."
            value={form.palettePosition}
            onChange={(e) =>
              setForm({
                ...form,
                palettePosition: e.target.value.replace(/\D/g, ''),
              })
            }
            disabled={submitting}
            style={{...inputStyle, borderColor: erros.palettePosition ? '#e31837' : '#ddd'}}
          />
          {erros.palettePosition && <div style={{ color: '#e31837', fontSize: '12px', marginTop: '4px' }}>❌ {erros.palettePosition}</div>}
        </div>

        {erros.localizacao && (
          <div style={{ padding: '12px', marginBottom: '15px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b', borderLeft: '4px solid #ef4444' }}>
            {erros.localizacao}
          </div>
        )}

        <div style={formGroupStyle}>
          <label style={labelStyle}>📛 Código do Produto</label>
          <input
            type="text"
            placeholder="Ex: 1695"
            value={form.productCode}
            onChange={(e) => {
              const codigo = e.target.value;
              setForm({ ...form, productCode: codigo });

              // Auto-preenchimento: se código existe, preenche nome
              const prodEncontrado = buscarProdutoPorCodigo(codigo);
              if (prodEncontrado) {
                setForm(prev => ({ ...prev, productCode: codigo, productName: prodEncontrado.nome }));
              }
            }}
            disabled={submitting}
            style={{...inputStyle, borderColor: erros.productCode ? '#e31837' : '#ddd'}}
          />
          {erros.productCode && <div style={{ color: '#e31837', fontSize: '12px', marginTop: '4px' }}>❌ {erros.productCode}</div>}
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📦 Produto (Nome)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Comece a digitar o nome do produto..."
              value={form.productName}
              onChange={(e) => {
                const nome = e.target.value;
                setForm({ ...form, productName: nome });

                // Gerar sugestões
                const sugestoes = gerarSugestoesNome(nome);
                setSugestoesNome(sugestoes);
                setMostrarSugestoesNome(sugestoes.length > 0);
              }}
              onFocus={() => {
                if (form.productName) {
                  const sugestoes = gerarSugestoesNome(form.productName);
                  setSugestoesNome(sugestoes);
                  setMostrarSugestoesNome(sugestoes.length > 0);
                }
              }}
              disabled={submitting}
              style={{...inputStyle, borderColor: erros.productName ? '#e31837' : '#ddd'}}
            />

            {mostrarSugestoesNome && sugestoesNome.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                zIndex: 10,
                maxHeight: '200px',
                overflowY: 'auto',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              }}>
                {sugestoesNome.map((prod, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setForm({ ...form, productCode: prod.codigo, productName: prod.nome });
                      setMostrarSugestoesNome(false);
                      setSugestoesNome([]);
                    }}
                    style={{
                      padding: '10px',
                      borderBottom: idx < sugestoesNome.length - 1 ? '1px solid #eee' : 'none',
                      cursor: 'pointer',
                      backgroundColor: '#f9f9f9',
                      fontSize: '12px',
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#efefef'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                  >
                    <strong>{prod.codigo}</strong> - {prod.nome}
                  </div>
                ))}
              </div>
            )}
          </div>
          {erros.productName && <div style={{ color: '#e31837', fontSize: '12px', marginTop: '4px' }}>❌ {erros.productName}</div>}
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>📅 Data de Validade</label>
          <input
            type="text"
            placeholder="DD/MM/AAAA"
            maxLength="10"
            value={form.expiryDate}
            onChange={(e) => {
              const dataFormatada = formatarData(e.target.value);
              setForm({ ...form, expiryDate: dataFormatada });
            }}
            disabled={submitting}
            style={{...inputStyle, borderColor: erros.expiryDate ? '#e31837' : '#ddd'}}
          />
          {erros.expiryDate && <div style={{ color: '#e31837', fontSize: '12px', marginTop: '4px' }}>❌ {erros.expiryDate}</div>}
        </div>

        <div style={formGroupStyle}>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', color: '#333' }}>
            <input
              type="checkbox"
              checked={form.repeatForAllPositions}
              onChange={(e) =>
                setForm({ ...form, repeatForAllPositions: e.target.checked })
              }
              disabled={submitting}
              style={{ marginRight: '10px', cursor: 'pointer', width: '18px', height: '18px' }}
            />
            🔁 Repetir este produto para todas as posições desta rua
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            style={buttonStyle}
            disabled={submitting || loadingAreas}
          >
            {submitting ? '⏳ Salvando...' : '➕ Adicionar novo produto'}
          </button>
          {produtosQueueados.length > 0 && (
            <button
              type="button"
              onClick={handleRegistrarTudo}
              style={{ ...buttonStyle, backgroundColor: '#22c55e' }}
              disabled={submitting}
            >
              ✅ Registrar {produtosQueueados.length} produto(s)
            </button>
          )}
        </div>
      </form>

      {/* Tabela de produtos adicionados */}
      {produtosQueueados.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h3 style={{ color: '#E31837' }}>📋 Produtos a Registrar</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Área</th>
                  <th style={thStyle}>Rua</th>
                  <th style={thStyle}>Posição</th>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Produto</th>
                  <th style={thStyle}>Validade</th>
                  <th style={thStyle}>Repetir Rua</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtosQueueados.map((prod, idx) => (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9',
                    }}
                  >
                    <td style={tdStyle}>{prod.area}</td>
                    <td style={tdStyle}>{prod.street}</td>
                    <td style={tdStyle}>{prod.palettePosition}</td>
                    <td style={tdStyle}><strong>{prod.productCode}</strong></td>
                    <td style={tdStyle}>{prod.productName}</td>
                    <td style={tdStyle}>{prod.expiryDate}</td>
                    <td style={tdStyle}>
                      {prod.repeatForAllPositions ? '✅ Sim' : '❌ Não'}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleRemoverProduto(idx)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        🗑️ Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
