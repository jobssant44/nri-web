import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useDb } from '../../utils/db';

// Busca codProdutos da pavg_embalagens onde embalagem = filtro
async function getCodigosPorEmbalagem(embalagem, colRevenda) {
  const snap = await getDocs(query(colRevenda('pavg_embalagens'), where('embalagem', '==', embalagem)));
  const codigos = new Set();
  snap.forEach(d => codigos.add(String(d.data().codProduto).trim()));
  return codigos;
}

// Soma disponivel do 02.05.02 para todos os codProdutos do set (sem filtro de depósito)
async function somarDisponivel020502(colecao, codigos, docRef) {
  const snap = await getDoc(docRef(colecao, 'atual'));
  if (!snap.exists()) return 0;
  let soma = 0;
  (snap.data().linhas ?? []).forEach(l => {
    if (codigos.has(String(l.codProduto).trim()) && typeof l.disponivel === 'number') {
      soma += l.disponivel;
    }
  });
  return soma;
}

export default function ConciliacaoPAVG() {
  const { col, docRef, colRevenda } = useDb();
  const [valores, setValores] = useState({});
  const [debug, setDebug] = useState(null);

  useEffect(() => {
    async function carregar() {
      // 1) Busca todos os documentos de embalagens para inspecionar
      const snapTodos = await getDocs(colRevenda('pavg_embalagens'));
      const todosEmbalagens = [];
      snapTodos.forEach(d => todosEmbalagens.push({ id: d.id, embalagem: d.data().embalagem }));

      // 2) Busca por embalagem específica
      const codigos1L = await getCodigosPorEmbalagem('O85 - GARRAFA RET.1000 ML', colRevenda);

      // 3) Lê o doc atual do 02.05.02
      const snap020502 = await getDoc(docRef('pavg_020502_carpina', 'atual'));
      const linhas020502 = snap020502.exists() ? (snap020502.data().linhas ?? []) : [];

      // 4) Linhas que batem com os códigos
      const linhasBatendo = linhas020502.filter(l => codigos1L.has(String(l.codProduto).trim()));

      const cheio39430 = linhasBatendo.reduce((s, l) => s + (typeof l.disponivel === 'number' ? l.disponivel : 0), 0);

      setDebug({
        totalEmbalagensDocs: todosEmbalagens.length,
        amostraEmbalagens: todosEmbalagens.slice(0, 5),
        codigosEncontrados: codigos1L.size,
        totalLinhas020502: linhas020502.length,
        linhasBatendo: linhasBatendo.length,
        amostraBatendo: linhasBatendo.slice(0, 3),
      });

      setValores(prev => ({ ...prev, cheio39430 }));
    }
    carregar();
  }, []);

  const cel = (cod, coluna) => {
    if (cod === '39430' && coluna === 'cheio') {
      return valores.cheio39430 === undefined ? '...' : valores.cheio39430.toLocaleString('pt-BR');
    }
    return '';
  };

  const grupos = [
    {
      label: '1L',
      itens: [
        { cod: '39431', descricao: 'GFA VIDRO 1L;AMBAR;RETORN.', un: 'UN' },
        { cod: '39430', descricao: 'GARRAFEIRA;12 GFA 1L;AMBEV.', un: 'CX' },
      ],
    },
    {
      label: '300 ML',
      itens: [
        { cod: '39356', descricao: 'GFA VIDRO 330ML;AMBAR;TIPO S;RETORN.', un: 'UN' },
        { cod: '43054', descricao: 'GARRAFEIRA;23 GFA 300ML;AZUL', un: 'CX' },
        { cod: '39432', descricao: 'GARRAFEIRA;24 GFA 300ML;AZUL;C/2', un: 'CX' },
      ],
    },
    {
      label: '600 ML',
      itens: [
        { cod: '39355', descricao: 'GFA VIDRO 635ML;AMBAR;TIPO A;RETORN.', un: 'UN' },
        { cod: '39413', descricao: 'GARRAFEIRA;24 GFA 600ML;ANTARCTICA;AZUL', un: 'CX' },
        { cod: '39405', descricao: 'GARRAFEIRA;24 GFA 600ML;ANTARCTICA', un: 'CX' },
        { cod: '39367', descricao: 'GARRAFEIRA;24 GFA 600ML;SKOL;C/1', un: 'CX' },
        { cod: '39364', descricao: 'GARRAFEIRA;24 GFA 600ML;BRAHMA;C/1', un: 'CX' },
      ],
    },
    {
      label: 'CHOPP',
      itens: [
        { cod: '35842', descricao: 'BARRIL CHOPP;10L', un: 'UN' },
        { cod: '25548', descricao: 'BARRIL CHOPP;30L', un: 'UN' },
        { cod: '20960', descricao: 'BARRIL CHOPP;50L', un: 'UN' },
      ],
    },
    {
      label: 'VERDE',
      itens: [
        { cod: '81010', descricao: 'GARRAFA VERDE 600ML RET', un: 'UN' },
        { cod: '80884', descricao: 'GARRAFA BECKS 600ML RET', un: 'UN' },
      ],
    },
  ];

  const totalLinhas = grupos.reduce((acc, g) => acc + g.itens.length, 0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 }}>
          Conciliação
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Conciliação do Ativo de Giro — {totalLinhas} produtos
        </p>
      </div>

      {debug && (
        <div style={{ backgroundColor: '#1e1e2e', color: '#a6e3a1', fontFamily: 'monospace', fontSize: 12, padding: 16, borderRadius: 8, marginBottom: 20, lineHeight: 1.8 }}>
          <div style={{ color: '#cba6f7', fontWeight: 700, marginBottom: 8 }}>🔍 Diagnóstico</div>
          <div>Docs em pavg_embalagens: <strong>{debug.totalEmbalagensDocs}</strong></div>
          <div>Amostra embalagens (id → embalagem):</div>
          {debug.amostraEmbalagens.map((e, i) => (
            <div key={i} style={{ paddingLeft: 16 }}>"{e.id}" → "{e.embalagem}"</div>
          ))}
          <div style={{ marginTop: 8 }}>Códigos com embalagem "O85 - GARRAFA RET.1000 ML": <strong>{debug.codigosEncontrados}</strong></div>
          <div>Linhas no 02.05.02 Carpina (atual): <strong>{debug.totalLinhas020502}</strong></div>
          <div>Linhas que batem com os códigos: <strong>{debug.linhasBatendo}</strong></div>
          {debug.amostraBatendo.length > 0 && (
            <>
              <div style={{ marginTop: 4 }}>Amostra:</div>
              {debug.amostraBatendo.map((l, i) => (
                <div key={i} style={{ paddingLeft: 16 }}>cod: {l.codProduto} · dep: {l.deposito} · disponivel: {l.disponivel}</div>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, fontFamily: 'inherit', minWidth: 1100 }}>
          <thead>
            <tr>
              <td colSpan={14} style={{ backgroundColor: '#1a2a5c', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: 14, padding: '10px 14px', letterSpacing: 0.5 }}>
                Conciliação do Ativo de Giro
              </td>
            </tr>
            <tr>
              <th style={th.base} rowSpan={2}></th>
              <th style={th.base} rowSpan={2}>Cod.</th>
              <th style={{ ...th.base, minWidth: 220 }} rowSpan={2}>Descrição</th>
              <th style={th.base} rowSpan={2}>UN</th>
              <th style={th.base} rowSpan={2}>Saldo I</th>
              <th colSpan={4} style={th.green}>Revenda</th>
              <th colSpan={4} style={th.navy}>Carta de Saldo</th>
              <th style={th.base} rowSpan={2}>Saldo F</th>
              <th style={th.base} rowSpan={2}>Dif</th>
            </tr>
            <tr>
              <th style={th.greenSub}>Cheio</th>
              <th style={th.greenSub}>Vazio</th>
              <th style={th.greenSub}>Transito</th>
              <th style={th.greenSub}>Comodato</th>
              <th style={th.navySub}>Fab. AC</th>
              <th style={th.navySub}>Fab. CM</th>
              <th style={th.navySub}>Fab. AQ</th>
              <th style={th.navySub}>Fab. IT</th>
            </tr>
          </thead>

          <tbody>
            {grupos.map((grupo) =>
              grupo.itens.map((item, itemIdx) => (
                <tr key={item.cod} style={{ backgroundColor: itemIdx % 2 === 0 ? '#fffde7' : '#fff9c4' }}>
                  {itemIdx === 0 && (
                    <td rowSpan={grupo.itens.length} style={{ backgroundColor: '#b0bec5', color: '#1a1a2e', fontWeight: 700, fontSize: 11, textAlign: 'center', verticalAlign: 'middle', padding: '4px 8px', borderRight: '1px solid #90a4ae', borderBottom: '2px solid #78909c', whiteSpace: 'nowrap' }}>
                      {grupo.label}
                    </td>
                  )}
                  <td style={td.cod}>{item.cod}</td>
                  <td style={td.desc}>{item.descricao}</td>
                  <td style={td.center}>{item.un}</td>
                  <td style={td.data}></td>
                  <td style={td.data}>{cel(item.cod, 'cheio')}</td>
                  <td style={td.data}>{cel(item.cod, 'vazio')}</td>
                  <td style={td.data}>{cel(item.cod, 'transito')}</td>
                  <td style={td.data}>{cel(item.cod, 'comodato')}</td>
                  <td style={td.data}>{cel(item.cod, 'fabAC')}</td>
                  <td style={td.data}>{cel(item.cod, 'fabCM')}</td>
                  <td style={td.data}>{cel(item.cod, 'fabAQ')}</td>
                  <td style={td.data}>{cel(item.cod, 'fabIT')}</td>
                  <td style={td.data}></td>
                  <td style={td.data}></td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={14} style={{ backgroundColor: '#1a2a5c', height: 10 }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const thBase = { padding: '7px 10px', fontWeight: 600, fontSize: 11, border: '1px solid #90a4ae', whiteSpace: 'nowrap', textAlign: 'center' };

const th = {
  base:     { ...thBase, backgroundColor: '#1a2a5c', color: '#fff' },
  green:    { ...thBase, backgroundColor: '#2e7d32', color: '#fff' },
  greenSub: { ...thBase, backgroundColor: '#388e3c', color: '#fff' },
  navy:     { ...thBase, backgroundColor: '#1a3a6c', color: '#fff' },
  navySub:  { ...thBase, backgroundColor: '#1565c0', color: '#fff' },
};

const td = {
  cod:    { padding: '5px 10px', fontWeight: 600, color: '#1a1a2e', border: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  desc:   { padding: '5px 10px', color: '#374151', border: '1px solid #e0e0e0', fontSize: 11 },
  center: { padding: '5px 10px', color: '#374151', border: '1px solid #e0e0e0', textAlign: 'center', fontSize: 11 },
  data:   { padding: '5px 10px', border: '1px solid #e0e0e0', textAlign: 'center', minWidth: 70, color: '#374151' },
};
