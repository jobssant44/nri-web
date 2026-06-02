import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRelatoriosMPD } from '../../context/RelatoriosMPDContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine, Brush,
} from 'recharts';

// ─── Navegação entre as abas MPD ─────────────────────────────────────────────
export const PAGES = [
  { label: 'EFC',            path: '/gestao-mpd/efc' },
  { label: 'EFD',            path: '/gestao-mpd/efd' },
  { label: 'TI',             path: '/gestao-mpd/ti' },
  { label: 'TI Físico',      path: '/gestao-mpd/ti-fisico' },
  { label: 'TI Financeiro',  path: '/gestao-mpd/ti-financeiro' },
  { label: 'Histograma',     path: '/gestao-mpd/histograma' },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  borderLight: '#f1f5f9',
  text:        '#0f172a',
  textSec:     '#475569',
  textMuted:   '#94a3b8',
  red:         '#E31837',
  redSoft:     'rgba(227,24,55,0.07)',
  redBorder:   'rgba(227,24,55,0.18)',
  blue:        '#1D5A9E',
  blueSoft:    'rgba(29,90,158,0.07)',
  blueBorder:  'rgba(29,90,158,0.18)',
  green:       '#15803d',
  greenSoft:   'rgba(21,128,61,0.07)',
  amber:       '#b45309',
  amberSoft:   'rgba(180,83,9,0.07)',
  shadow:      '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
  shadowMd:    '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
  radius:      14,
  font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
  mono:        "'JetBrains Mono', 'Fira Code', ui-monospace, 'Courier New', monospace",
  transition:  'all 0.22s cubic-bezier(0.16,1,0.3,1)',
};

const STYLE_ID = 'mpd-fase-styles';
if (!document.getElementById(STYLE_ID)) {
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mpd-chip:hover { opacity: 0.8; }
    .mpd-nav-btn { transition: all 0.18s cubic-bezier(0.16,1,0.3,1); }
    .mpd-nav-btn:hover { background: ${D.blueSoft} !important; color: ${D.blue} !important; border-color: ${D.blue} !important; }
    .mpd-select:focus, .mpd-input:focus { outline: none; border-color: ${D.blue} !important; box-shadow: 0 0 0 3px ${D.blueSoft}; }
    .mpd-btn-clear:hover { border-color: ${D.red} !important; color: ${D.red} !important; }
    .recharts-wrapper, .recharts-wrapper svg,
    .recharts-wrapper *:focus, .recharts-surface { outline: none !important; }
  `;
  document.head.appendChild(st);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function horaParaMinutos(h) {
  if (!h) return null;
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0 && n < 1) return Math.round(n * 24 * 60);
  return null;
}

// Classifica a linha por tipo de frota:
//   - FF (Frota Padronizada) → coluna "Frota Cadastro" começa com "padroniz"
//     (cobre "Padronizada", "Padronizado", "Padronizadas", etc.)
//   - Spot (demais) → qualquer outro valor, inclusive vazio/null
// Usado pelo cálculo de EFC pra escolher entre meta-EFC-FF e meta-EFC-Spot.
function isFrotaPadronizada(linha) {
  const f = String(linha?.frotaCadastrada ?? '').trim().toLowerCase();
  return f.startsWith('padroniz');
}

// Meta de horário é considerada "não cadastrada" quando vazia ou "00:00"
// (default do MetasMPD). Sem esse tratamento, qualquer hora positiva ficava
// NOK indevidamente quando o supervisor ainda não setou a meta.
function metaValida(metaStr) {
  if (!metaStr) return false;
  const s = String(metaStr).trim();
  return s !== '' && s !== '00:00';
}

// ─── Filtros multi-select (padrão WJS) ────────────────────────────────────────
// Todos os filtros (dropdowns + cross-filter dos gráficos) suportam múltiplos
// valores. Estado é guardado como array | null | '' (compatível com filtro vazio).

// Normaliza qualquer formato de filtro pra array — aceita string (single legado),
// null/'' (vazio) ou array (multi).
function asLista(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v : [v];
}

// Decide o novo valor do filtro quando o user clica num gráfico/linha.
//   - Sem Ctrl/Cmd → substitui (toggle único): se já era o único valor, limpa.
//   - Com Ctrl/Cmd → adiciona ao set; se já estava, remove (toggle item).
// Retorna `null` quando a lista fica vazia (mantém shape compatível).
function toggleMulti(atual, valor, event) {
  const lista = asLista(atual);
  const isMulti = !!(event && (event.ctrlKey || event.metaKey));
  if (isMulti) {
    const idx = lista.indexOf(valor);
    const nova = idx >= 0 ? lista.filter(v => v !== valor) : [...lista, valor];
    return nova.length === 0 ? null : nova;
  }
  if (lista.length === 1 && lista[0] === valor) return null; // re-click → limpa
  return [valor];
}

// eslint-disable-next-line no-unused-vars
function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val ?? '').trim().replace(/\s/g, '');
  if (!str || str === '-') return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  let s = str;
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = str.replace(',', '.');
  } else if (lastDot !== -1) {
    const after = str.substring(lastDot + 1);
    if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str)) s = str.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parser de data robusto — aceita:
//   "DD/MM/AAAA" (padrão BR)
//   "MM/DD/AAAA" (padrão US, comum em Excel exportado em locale en-US)
//   "AAAA-MM-DD" (ISO)
//   serial numérico do Excel
//
// Estratégia de desambiguação (p1/p2/AAAA):
//   - p1 > 12 → DD/MM inequívoco (dia não pode ser mês)
//   - p2 > 12 → MM/DD inequívoco
//   - ambos ≤ 12 → ambíguo, assume DD/MM (sistema é BR)
function parseDataBR(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const s = String(str).trim();
  if (!s) return null;

  // ISO AAAA-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const ano = parseInt(iso[1], 10), mes = parseInt(iso[2], 10), dia = parseInt(iso[3], 10);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return new Date(ano, mes - 1, dia);
  }

  // PP/SS/AAAA (com barra ou traço)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const ano = parseInt(m[3], 10);
    let dia, mes;
    if (p1 > 12)      { dia = p1; mes = p2; }   // DD/MM (BR)
    else if (p2 > 12) { dia = p2; mes = p1; }   // MM/DD (US)
    else              { dia = p1; mes = p2; }   // ambíguo → DD/MM (padrão BR)
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return new Date(ano, mes - 1, dia);
  }

  // PP/SS/AA (ano com 2 dígitos — converte 50+ pra 19XX, < 50 pra 20XX)
  const curto = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (curto) {
    const p1 = parseInt(curto[1], 10);
    const p2 = parseInt(curto[2], 10);
    const ano2 = parseInt(curto[3], 10);
    const ano  = ano2 < 50 ? 2000 + ano2 : 1900 + ano2;
    let dia, mes;
    if (p1 > 12)      { dia = p1; mes = p2; }
    else if (p2 > 12) { dia = p2; mes = p1; }
    else              { dia = p1; mes = p2; }
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return new Date(ano, mes - 1, dia);
  }

  // Serial Excel (n.º grande de dias desde 1900)
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1000) return new Date(Math.round((n - 25569) * 86400 * 1000));

  return null;
}

function toISO(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line no-unused-vars
function toMesAno(str) {
  const d = parseDataBR(str);
  if (!d) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Filtro cruzado ───────────────────────────────────────────────────────────
// Filtros globais (frota, período): sempre aplicados em todos os charts.
// Filtros de cross-filter (data, motorista, placa): excluídos no chart proprietário.
// TODOS os filtros são multi-aware: aceitam string única (legado), array (multi) ou null.
function filtrarLinhas(linhas, filtros, excluir = null) {
  const frotas     = asLista(filtros.frota);
  const datas      = asLista(filtros.data);
  const motoristas = asLista(filtros.motorista);
  const placas     = asLista(filtros.placa);
  return linhas.filter(l => {
    // Globais — aplicados sempre
    if (frotas.length > 0 && !frotas.includes(l.frotaCadastrada)) return false;
    if (filtros.dataInicio || filtros.dataFim) {
      const iso = toISO(l.dataEmissao);
      if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
      if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
    }
    // Cross-filter — ignorado no chart da própria dimensão
    if (excluir !== 'data'      && datas.length      > 0 && !datas.includes(toISO(l.dataEmissao))) return false;
    if (excluir !== 'motorista' && motoristas.length > 0 && !motoristas.includes(l.motorista))     return false;
    if (excluir !== 'placa'     && placas.length     > 0 && !placas.includes(l.placa))             return false;
    return true;
  });
}

const FILTROS_VAZIOS = { data: null, motorista: null, placa: null, frota: null, dataInicio: '', dataFim: '' };

// ─── Agregadores ──────────────────────────────────────────────────────────────
function agruparPorData(linhas) {
  const mapa = new Map();
  linhas.forEach(l => {
    const iso = toISO(l.dataEmissao);
    if (!iso) return;
    const cur = mapa.get(iso) ?? { iso, label: l.dataEmissao || iso, count: 0 };
    mapa.set(iso, { ...cur, count: cur.count + 1 });
  });
  return [...mapa.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

// ─── EFC ──────────────────────────────────────────────────────────────────────
// Todas as funções agruparEFC* recebem `getMeta(linha) => 'HH:MM'`
// que devolve a meta de horário a usar pra AQUELA linha (FF vs Spot vs único).
// Isso permite metas diferentes por tipo de frota no mesmo agrupamento sem
// duplicar lógica. Se a meta retornada for "00:00"/vazia, a linha não pode
// ser avaliada no mesmo dia (vira NOK só se isoOp > isoEm).

// Decide se o mapa é OK com base nas datas/hora + meta-da-linha. Centraliza
// a regra pra não duplicar em cada agrupar.
//
// Regras por fase:
//   EFC (carregamento, atividade da véspera da entrega):
//     - dataOp < dataEm           → OK auto (carregou antes do dia da entrega)
//     - dataOp > dataEm           → NOK auto (atrasou o carregamento)
//     - dataOp = dataEm           → OK se horaOp ≤ meta (FF ou Spot conforme frota)
//
//   EFD (descarga, acontece após o caminhão voltar da rota):
//     - Compara APENAS horaOp ≤ meta, ignora diferença de data.
//     - Motivo: dataOp é tipicamente > dataEm (caminhão sai no dia da emissão,
//       volta horas depois — a operação de descarga é regida pelo horário de
//       retorno ao CD, não pela data calendário.
//     - Sem meta cadastrada → NOK (força o supervisor a configurar).
//
//   Demais fases (ex.: TI) → mesma regra do EFC.
function ehMapaOK(linha, getMeta, fase) {
  const isoOp = toISO(linha.dataOperacao);
  const isoEm = toISO(linha.dataEmissao);
  if (!isoOp || !isoEm) return false;

  // EFD: só hora vs meta, qualquer data conta.
  if (fase === 'EFD') {
    const metaStr = getMeta(linha);
    if (!metaValida(metaStr)) return false;
    const metaMin = horaParaMinutos(metaStr);
    if (metaMin == null) return false;
    const hMin = horaParaMinutos(linha.horaOperacao);
    if (hMin == null) return false;
    return hMin <= metaMin;
  }

  // EFC / demais: regra de véspera da entrega.
  if (isoOp < isoEm) return true;
  if (isoOp > isoEm) return false;
  // Mesmo dia → depende da meta da linha (FF ou Spot)
  const metaStr = getMeta(linha);
  if (!metaValida(metaStr)) return false;
  const metaMin = horaParaMinutos(metaStr);
  if (metaMin == null) return false;
  const hMin = horaParaMinutos(linha.horaOperacao);
  if (hMin == null) return false;
  return hMin <= metaMin;
}

// Agrupa EFC por data: % = mapas OK ÷ total de mapas naquele dia.
// "OK" = (dataOperacao < dataEmissao) OU (dataOperacao = dataEmissao E horaOperacao ≤ meta).
// Conta MAPAS ÚNICOS por dia (não linhas) — se o mesmo mapa aparece em 2 linhas
// de fase=Carregado, conta 1 vez; basta ter ALGUMA linha OK pra mapa ser OK.
function agruparEFCPorData(linhas, getMeta, fase) {
  // Map<isoDia, { iso, label, totalMapas: Set, mapasOK: Set }>
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    const iso = toISO(l.dataEmissao);
    if (!iso) return;
    const isoOp = toISO(l.dataOperacao);
    if (!isoOp) return;

    let cur = mapa.get(iso);
    if (!cur) {
      // Label do eixo X: só DD/MM (sem ano), construído a partir do ISO pra
      // garantir formato consistente independente do que veio no CSV original.
      const [, mm, dd] = iso.split('-');
      cur = { iso, label: `${dd}/${mm}`, totalMapas: new Set(), mapasOK: new Set() };
      mapa.set(iso, cur);
    }
    cur.totalMapas.add(l.mapa);
    if (ehMapaOK(l, getMeta, fase)) cur.mapasOK.add(l.mapa);
  });
  return [...mapa.values()]
    .map(d => {
      const total = d.totalMapas.size;
      const ok    = d.mapasOK.size;
      const efc   = total > 0 ? Math.round((ok / total) * 1000) / 10 : 0; // 1 casa decimal
      return { iso: d.iso, label: d.label, total, ok, efc };
    })
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

// EFC por Mês: agrega mapas únicos por mês (chave YYYY-MM da dataEmissao).
// Mesma regra do gráfico diário (OK se operação < emissão OU mesmo dia + hora ≤ meta).
function agruparEFCPorMes(linhas, getMeta, fase) {
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    const dEm = parseDataBR(l.dataEmissao);
    if (!dEm) return;
    const chave = `${dEm.getFullYear()}-${String(dEm.getMonth() + 1).padStart(2, '0')}`;
    let cur = mapa.get(chave);
    if (!cur) {
      cur = {
        chave,
        label: `${String(dEm.getMonth() + 1).padStart(2, '0')}/${dEm.getFullYear()}`,
        totalMapas: new Set(),
        mapasOK: new Set(),
      };
      mapa.set(chave, cur);
    }
    cur.totalMapas.add(l.mapa);
    if (ehMapaOK(l, getMeta, fase)) cur.mapasOK.add(l.mapa);
  });
  return [...mapa.values()]
    .map(d => {
      const total = d.totalMapas.size;
      const ok    = d.mapasOK.size;
      const efc   = total > 0 ? Math.round((ok / total) * 1000) / 10 : 0;
      return { chave: d.chave, label: d.label, total, ok, efc };
    })
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

function agruparPorMotorista(linhas, top = 12) {
  const mapa = new Map();
  linhas.forEach(l => {
    const k = (l.motorista ?? '').trim() || '—';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, count]) => ({ name, count }));
}

// Agrupa EFC por motorista: % = mapas OK ÷ total de mapas atribuídos àquele motorista.
// Mapas únicos por motorista (não linhas). Ordena por % EFC ascendente (pior primeiro)
// pra destacar quem precisa de atenção. Em caso de empate, prioriza maior volume.
// `top = Infinity` por padrão → mostra todos. Passe um número pra limitar.
function agruparEFCPorMotorista(linhas, getMeta, fase, top = Infinity) {
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    const mot = String(l.motorista ?? '').trim() || '—';
    let cur = mapa.get(mot);
    if (!cur) { cur = { total: new Set(), ok: new Set() }; mapa.set(mot, cur); }
    cur.total.add(l.mapa);
    if (ehMapaOK(l, getMeta, fase)) cur.ok.add(l.mapa);
  });
  return [...mapa.entries()]
    .map(([codigo, d]) => ({
      codigo,
      total: d.total.size,
      ok: d.ok.size,
      efc: d.total.size > 0 ? Math.round((d.ok.size / d.total.size) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.efc - b.efc || b.total - a.total) // pior EFC primeiro; em empate, mais volume
    .slice(0, top);
}

function agruparPorPlaca(linhas, top = 12) {
  const mapa = new Map();
  linhas.forEach(l => {
    const k = (l.placa ?? '').trim() || '—';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, count]) => ({ name, count }));
}

// EFC por Placa: % = mapas OK ÷ total atribuído àquela placa.
// Mesma ordenação do motorista (pior EFC primeiro, depois maior volume).
// `top = Infinity` → mostra todas. Passe um número pra limitar.
function agruparEFCPorPlaca(linhas, getMeta, fase, top = Infinity) {
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    const placa = String(l.placa ?? '').trim() || '—';
    let cur = mapa.get(placa);
    if (!cur) { cur = { total: new Set(), ok: new Set() }; mapa.set(placa, cur); }
    cur.total.add(l.mapa);
    if (ehMapaOK(l, getMeta, fase)) cur.ok.add(l.mapa);
  });
  return [...mapa.entries()]
    .map(([placa, d]) => ({
      placa,
      total: d.total.size,
      ok: d.ok.size,
      efc: d.total.size > 0 ? Math.round((d.ok.size / d.total.size) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.efc - b.efc || b.total - a.total)
    .slice(0, top);
}

// EFC por Mapa: cada mapa é 100% (OK) ou 0% (NOK). Lista TODOS os mapas com
// NOK primeiro (piores casos no topo). `top = Infinity` por padrão.
function agruparEFCPorMapa(linhas, getMeta, fase, top = Infinity) {
  // Map<mapa, { motorista, placa, dataEmissao, dataOperacao, horaOperacao, ok }>
  // Se houver várias linhas do mesmo mapa, basta UMA OK pra mapa ser OK.
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    let cur = mapa.get(l.mapa);
    if (!cur) {
      cur = {
        mapa: l.mapa,
        placa: l.placa || '',
        motorista: l.motorista || '',
        frotaCadastrada: l.frotaCadastrada || '',
        dataEmissao: l.dataEmissao || '',
        dataOperacao: l.dataOperacao || '',
        horaOperacao: l.horaOperacao || '',
        ok: false,
      };
      mapa.set(l.mapa, cur);
    }
    if (ehMapaOK(l, getMeta, fase)) cur.ok = true;
  });
  return [...mapa.values()]
    // total/ok como números (1/0) pra que a linha de Total da TabelaEFC consiga
    // somar e calcular o % global ponderado (somaOK/somaTotal). Sem isso, d.total
    // ficava undefined e o rodapé mostrava sempre 0%.
    .map(d => ({ ...d, total: 1, ok: d.ok ? 1 : 0, efc: d.ok ? 100 : 0 }))
    .sort((a, b) => a.efc - b.efc) // NOK (0) primeiro, OK (100) depois
    .slice(0, top);
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function TopbarNav({ current }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PAGES.filter(p => p.path !== current).map(p => (
        <button key={p.path} className="mpd-nav-btn" onClick={() => navigate(p.path)}
          style={{ padding: '7px 16px', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: D.textSec, fontFamily: D.font, letterSpacing: 0.2 }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function KPICard({ label, valor, sub, cor, destaque }) {
  return (
    <div style={{
      background: destaque ? cor : D.surface,
      border: `1px solid ${destaque ? cor : D.border}`,
      borderLeft: destaque ? undefined : `3px solid ${cor}`,
      borderRadius: D.radius,
      padding: destaque ? '24px 24px 20px' : '18px 20px',
      boxShadow: destaque ? `0 4px 24px ${cor}22` : D.shadow,
      animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: destaque ? 'rgba(255,255,255,0.65)' : D.textMuted, fontFamily: D.font, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: destaque ? 30 : 22, fontWeight: 800, color: destaque ? '#fff' : D.text, fontFamily: D.mono, letterSpacing: -1, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: destaque ? 'rgba(255,255,255,0.5)' : D.textMuted, marginTop: 7, fontFamily: D.font }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ titulo, badge, children }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '22px 24px', boxShadow: D.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>{titulo}</span>
        </div>
        {badge}
      </div>
      <div style={{ borderTop: `1px solid ${D.borderLight}`, paddingTop: 16 }}>{children}</div>
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <div className="mpd-chip" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 8px 5px 11px',
      background: D.redSoft, border: `1px solid ${D.redBorder}`,
      borderRadius: 8, fontSize: 11.5, color: D.red, fontWeight: 600,
      fontFamily: D.font, cursor: 'default', transition: D.transition,
    }}>
      {label}
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.red, fontSize: 12, lineHeight: 1, padding: '1px 3px', borderRadius: 3, opacity: 0.7 }}>✕</button>
    </div>
  );
}

// Dropdown custom com checkboxes — substitui <select> nativo nos filtros.
// - Click numa opção: substitui (single select).
// - Ctrl/Cmd+click numa opção: adiciona/remove sem fechar (multi).
// - Click no item "Todas/Limpar" no topo: limpa.
// - Click fora fecha. Mostra "N selecionado(s)" no header quando multi.
//
// Padrão WJS: TODO filtro em lista suspensa do app DEVE usar este componente
// (ou equivalente) pra suportar multi-select via Ctrl/Cmd+click.
function MultiSelectDropdown({ label, valor, opcoes, onChange, placeholderTodos = 'Todas' }) {
  const [aberto, setAberto] = useState(false);
  const selecionados = asLista(valor);

  // Click fora fecha
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e) {
      if (!e.target.closest?.('[data-multiselect]')) setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [aberto]);

  // Texto do botão
  let texto;
  if (selecionados.length === 0)        texto = placeholderTodos;
  else if (selecionados.length === 1)   texto = selecionados[0];
  else                                  texto = `${selecionados.length} selecionado(s)`;

  function clicarOpcao(opcao, e) {
    e.preventDefault();
    e.stopPropagation();
    onChange(toggleMulti(valor, opcao, e));
    if (!(e.ctrlKey || e.metaKey)) setAberto(false); // sem ctrl → fecha; com ctrl → mantém aberto pra selecionar mais
  }

  return (
    <div data-multiselect style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={sLabel}>{label}</label>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        style={{
          ...sSelect,
          textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, cursor: 'pointer',
          color: selecionados.length === 0 ? D.textMuted : D.text,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
        <span style={{ fontSize: 9, color: D.textMuted, transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', maxHeight: 320, overflowY: 'auto',
          background: D.surface, border: `1px solid ${D.border}`,
          borderRadius: 8, boxShadow: D.shadowMd, zIndex: 50,
          padding: 4,
        }}>
          {/* Dica de Ctrl+click no topo */}
          <div style={{ padding: '7px 12px 9px', fontSize: 10, color: D.textMuted, fontFamily: D.font, borderBottom: `1px solid ${D.borderLight}` }}>
            Segure <strong style={{ color: D.text }}>Ctrl</strong> para selecionar múltiplos
          </div>
          {/* Limpar (todas) */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); setAberto(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 12px',
              background: selecionados.length === 0 ? D.redSoft : 'transparent',
              border: 'none', borderRadius: 6,
              cursor: 'pointer', textAlign: 'left',
              fontSize: 12, fontWeight: selecionados.length === 0 ? 700 : 500,
              color: selecionados.length === 0 ? D.red : D.textSec,
              fontFamily: D.font,
            }}
            onMouseEnter={e => { if (selecionados.length !== 0) e.currentTarget.style.background = D.bg; }}
            onMouseLeave={e => { if (selecionados.length !== 0) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 11, opacity: 0.6 }}>○</span>
            {placeholderTodos}
          </button>
          {opcoes.map(op => {
            const checado = selecionados.includes(op);
            return (
              <button
                type="button"
                key={op}
                onClick={(e) => clicarOpcao(op, e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '7px 12px',
                  background: checado ? D.redSoft : 'transparent',
                  border: 'none', borderRadius: 6,
                  cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, fontWeight: checado ? 700 : 500,
                  color: checado ? D.red : D.text,
                  fontFamily: D.font,
                }}
                onMouseEnter={e => { if (!checado) e.currentTarget.style.background = D.bg; }}
                onMouseLeave={e => { if (!checado) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: 3,
                  border: `1.5px solid ${checado ? D.red : D.border}`,
                  background: checado ? D.red : D.surface,
                  color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 700,
                  flexShrink: 0,
                }}>{checado ? '✓' : ''}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Skeleton({ width = '100%', height = 20, radius = 6, style: sx = {} }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s ease-in-out infinite', ...sx }} />
  );
}

function Vazio() {
  return (
    <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <svg width="24" height="24" fill="none" stroke={D.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <span style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.font, fontStyle: 'italic' }}>Sem dados para o filtro selecionado</span>
    </div>
  );
}

function EmptyState({ fase }) {
  return (
    <div style={{ padding: '72px 24px', textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: D.redSoft, border: `1px solid ${D.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>Nenhum dado de {fase} encontrado</div>
      <div style={{ fontSize: 13, color: D.textSec, maxWidth: 320, margin: '0 auto', lineHeight: 1.65, fontFamily: D.font }}>
        Importe o relatório <strong>03.11.20</strong> em <strong>Importar relatórios</strong> para visualizar os dados.
      </div>
    </div>
  );
}

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
          {p.name ?? 'Qtd'}: {p.value}
        </div>
      ))}
    </div>
  );
}

// Tabela "EFC por X" — cores harmônicas com a página (fundo branco + indicador
// lateral colorido + badge "pill" à direita). Mostra TODOS os itens com scroll.
// Linha "Total" no rodapé com EFC global ponderado (somaOK / somaTotal).
//
// Props:
//   titulo         — título do card
//   colLabel       — nome da coluna da esquerda
//   dados          — [{ ok, total, efc, ... }]
//   getKey(d)      — chave única do item (pra filtros e React key)
//   getLabel(d)    — texto da coluna esquerda
//   formatValor(d) — opcional, retorna node React pra coluna direita
//                    (default: `XX%`). Útil pra mostrar "OK"/"NOK".
//   filtroAtivo    — valor atual do filtro (pra destacar linha selecionada)
//   onClick(d)     — handler do click na linha (opcional)
//   metaPercent    — limiar pra colorir verde/vermelho (default: 100%)
function TabelaEFC({
  titulo, colLabel, dados, getKey, getLabel, formatValor,
  filtroAtivo, onClick, metaPercent,
}) {
  const limiar = metaPercent != null ? metaPercent : 100;
  const totalMapas = dados.reduce((s, d) => s + (d.total || 0), 0);
  const totalOK    = dados.reduce((s, d) => s + (d.ok    || 0), 0);
  const efcGlobal  = totalMapas > 0 ? Math.round((totalOK / totalMapas) * 1000) / 10 : 0;
  const totalAtingiu = efcGlobal >= limiar;

  // ── Ordenação por coluna (padrão WJS: toda tabela tem seta clicável no cabeçalho) ──
  const [sortKey, setSortKey] = useState(null);   // 'label' | 'valor' | null
  const [sortDir, setSortDir] = useState('asc');  // 'asc' | 'desc'

  function alternarOrdem(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const dadosOrdenados = useMemo(() => {
    if (!sortKey) return dados;
    const arr = [...dados];
    arr.sort((a, b) => {
      if (sortKey === 'valor') {
        const va = a.efc ?? 0;
        const vb = b.efc ?? 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      // sortKey === 'label'
      const va = String(getLabel(a) ?? '');
      const vb = String(getLabel(b) ?? '');
      // Se ambos são numéricos puros (mapas, códigos), ordena como número
      const naMatch = va.trim().match(/^(\d+)/);
      const nbMatch = vb.trim().match(/^(\d+)/);
      if (naMatch && nbMatch && /^\d+\s*$/.test(va.trim()) && /^\d+\s*$/.test(vb.trim())) {
        const na = parseInt(naMatch[1], 10);
        const nb = parseInt(nbMatch[1], 10);
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      return sortDir === 'asc'
        ? va.localeCompare(vb, 'pt-BR', { numeric: true })
        : vb.localeCompare(va, 'pt-BR', { numeric: true });
    });
    return arr;
  }, [dados, sortKey, sortDir, getLabel]);

  // Seta de ordenação que aparece no cabeçalho
  function SetaOrdem({ ativo }) {
    if (!ativo) {
      return <span style={{ fontSize: 9, color: D.textMuted, opacity: 0.5, marginLeft: 4 }}>↕</span>;
    }
    return (
      <span style={{ fontSize: 9, color: D.red, marginLeft: 4 }}>
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  }

  const headerCellStyle = {
    cursor: 'pointer',
    userSelect: 'none',
    transition: D.transition,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  };

  return (
    <div style={{
      background: D.surface,
      border: `1px solid ${D.border}`,
      borderRadius: D.radius,
      boxShadow: D.shadow,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header — mesmo padrão dos outros cards (vermelho WJS) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px',
        borderBottom: `1px solid ${D.borderLight}`,
      }}>
        <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
        <span style={{
          fontSize: 13, fontWeight: 700, color: D.text,
          letterSpacing: -0.2, fontFamily: D.font,
        }}>{titulo}</span>
      </div>

      {/* Sub-header das colunas — clicável pra ordenar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px',
        background: D.bg,
        color: D.textMuted,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        borderBottom: `1px solid ${D.borderLight}`,
      }}>
        <div
          onClick={() => alternarOrdem('label')}
          style={{ ...headerCellStyle, padding: '8px 16px', color: sortKey === 'label' ? D.text : D.textMuted }}
          title={`Ordenar por ${colLabel}`}
        >
          <span>{colLabel}</span>
          <SetaOrdem ativo={sortKey === 'label'} />
        </div>
        <div
          onClick={() => alternarOrdem('valor')}
          style={{ ...headerCellStyle, padding: '8px 12px', justifyContent: 'center', color: sortKey === 'valor' ? D.text : D.textMuted }}
          title="Ordenar por % EFC"
        >
          <span>% EFC</span>
          <SetaOrdem ativo={sortKey === 'valor'} />
        </div>
      </div>

      {/* Body com scroll */}
      <div style={{ maxHeight: 420, overflowY: 'auto', flex: 1 }}>
        {dadosOrdenados.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: D.textMuted, fontSize: 13, fontStyle: 'italic' }}>
            Sem dados pra este período.
          </div>
        ) : (
          dadosOrdenados.map((d, i) => {
            const atingiu = d.efc >= limiar;
            const cor     = atingiu ? D.green : D.red;
            const corSoft = atingiu ? D.greenSoft : D.redSoft;
            const key     = getKey(d);
            const ativo   = asLista(filtroAtivo).includes(key);
            return (
              <div
                key={key}
                // Passa o event pro onClick — assim Ctrl/Cmd+click vira multi-select
                onClick={(e) => onClick && onClick(d, e)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px',
                  alignItems: 'center',
                  background: ativo ? corSoft : (i % 2 === 0 ? D.surface : D.bg),
                  borderTop: i === 0 ? 'none' : `1px solid ${D.borderLight}`,
                  borderLeft: `3px solid ${cor}`,
                  cursor: onClick ? 'pointer' : 'default',
                  fontSize: 12,
                  fontFamily: D.font,
                  transition: D.transition,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = corSoft; }}
                onMouseLeave={e => { e.currentTarget.style.background = ativo ? corSoft : (i % 2 === 0 ? D.surface : D.bg); }}
              >
                <div style={{
                  padding: '8px 16px',
                  color: D.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {getLabel(d)}
                </div>
                <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: corSoft,
                    color: cor,
                    fontFamily: D.mono,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: 0.3,
                    minWidth: 48,
                  }}>
                    {formatValor ? formatValor(d) : `${d.efc.toFixed(1).replace('.', ',')}%`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé com Total — sutil, com mesma cor do header pra fechar visualmente */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px',
        alignItems: 'center',
        background: D.bg,
        borderTop: `1px solid ${D.border}`,
        fontSize: 12,
        fontWeight: 700,
        color: D.text,
        letterSpacing: 0.3,
        fontFamily: D.font,
      }}>
        <div style={{ padding: '10px 16px' }}>Total</div>
        <div style={{ padding: '6px 10px', textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            background: totalAtingiu ? D.greenSoft : D.redSoft,
            color: totalAtingiu ? D.green : D.red,
            fontFamily: D.mono,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.3,
            minWidth: 48,
          }}>
            {efcGlobal.toFixed(1).replace('.', ',')}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Tooltip do gráfico EFC por Motorista — mostra "código - Nome" + %EFC + mapas OK/total
function TooltipEFCMotorista({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 12.5 }}>{d.label}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 16, marginBottom: 2 }}>
        {d.efc.toFixed(1).replace('.', ',')}% EFC
      </div>
      <div style={{ color: D.textSec, fontFamily: D.mono, fontSize: 11 }}>
        {d.ok} OK de {d.total} mapa{d.total === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// Tooltip do gráfico EFC por Placa — mostra placa + %EFC + mapas OK/total
function TooltipEFCPlaca({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 160 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 13, fontFamily: D.mono, letterSpacing: 0.5 }}>{d.placa}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 16, marginBottom: 2 }}>
        {d.efc.toFixed(1).replace('.', ',')}% EFC
      </div>
      <div style={{ color: D.textSec, fontFamily: D.mono, fontSize: 11 }}>
        {d.ok} OK de {d.total} mapa{d.total === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// Tooltip do gráfico EFC por Mapa — mostra mapa + placa + motorista + status + datas/hora
function TooltipEFCMapa({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const cor = d.efc === 100 ? D.green : D.red;
  const status = d.efc === 100 ? 'OK' : 'NOK';
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 13 }}>
        Mapa <span style={{ fontFamily: D.mono }}>{d.mapa}</span>
      </div>
      <div style={{ color: cor, fontWeight: 700, fontFamily: D.font, fontSize: 16, marginBottom: 6 }}>
        {status}
      </div>
      <div style={{ color: D.textSec, fontSize: 11, lineHeight: 1.6 }}>
        {d.placa     && <div><strong>Placa:</strong> <span style={{ fontFamily: D.mono }}>{d.placa}</span></div>}
        {d.motorista && <div><strong>Motorista:</strong> {d.motorista}</div>}
        {d.dataEmissao  && <div><strong>Emissão:</strong> <span style={{ fontFamily: D.mono }}>{d.dataEmissao}</span></div>}
        {d.dataOperacao && <div><strong>Operação:</strong> <span style={{ fontFamily: D.mono }}>{d.dataOperacao}</span> às <span style={{ fontFamily: D.mono }}>{d.horaOperacao || '—'}</span></div>}
      </div>
    </div>
  );
}

// Tooltip do gráfico EFC Mês a Mês — mostra mês + %EFC + mapas OK/total
function TooltipEFCMes({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 150 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 13 }}>{d.label}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 16, marginBottom: 2 }}>
        {d.efc.toFixed(1).replace('.', ',')}% EFC
      </div>
      <div style={{ color: D.textSec, fontFamily: D.mono, fontSize: 11 }}>
        {d.ok} OK de {d.total} mapa{d.total === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// Tooltip do gráfico EFC por Dia — mostra %EFC + mapas OK / total
function TooltipEFC({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 150 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 12.5 }}>{label}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 16, marginBottom: 2 }}>
        {d.efc.toFixed(1).replace('.', ',')}% EFC
      </div>
      <div style={{ color: D.textSec, fontFamily: D.mono, fontSize: 11 }}>
        {d.ok} OK de {d.total} mapa{d.total === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ─── Estilos dos controles de filtro ─────────────────────────────────────────
const sLabel  = { fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: D.textSec, fontFamily: D.font };
const sSelect = {
  padding: '7px 32px 7px 11px', border: `1px solid ${D.border}`, borderRadius: 8,
  fontSize: 12.5, color: D.text, background: `${D.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 10px center`,
  fontFamily: D.font, cursor: 'pointer', minWidth: 155,
  WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
  transition: D.transition,
};
const sInput  = { padding: '7px 11px', border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 12.5, color: D.text, background: D.bg, fontFamily: D.font, transition: D.transition };
const tdS     = { padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font };

// ─── Página da Fase (EFC / EFD / TI) ─────────────────────────────────────────
export default function FasePage({ fase, faseCodigo: faseCod }) {
  // useDb não é mais usado aqui — todos os fetches migraram pro Context.
  // Mantém-se só pra back-compat se algum código abaixo dependia (e pra outras
  // queries específicas que não foram migradas).
  const faseCodigo = faseCod ?? fase;
  const loc = useLocation();

  // Dados compartilhados entre EFC, EFD, TI e Histograma — vêm do Context
  // que carrega 1× por sessão (ver RelatoriosMPDContext). Antes esta página
  // fazia 3 getDocs ao montar; agora só lê do cache.
  const { linhas, motoristasMap, metas, pronto } = useRelatoriosMPD();
  const carregando = !pronto;

  // Filtros / UI continuam locais (estado de tela, não dado de servidor)
  const [filtros, setFiltros]       = useState(FILTROS_VAZIOS);
  const [busca, setBusca]               = useState('');
  const [ordenacao, setOrdenacao]       = useState({ campo: 'dataEmissao', direcao: 'desc' });
  const [janelaDias, setJanelaDias]     = useState('mes');

  // Metas derivadas de `metas` + `fase`. Antes setávamos em 4 useState dentro
  // do useEffect do fetch; agora memo-derivado é mais simples e re-roda
  // automaticamente se o Context atualizar (botão "Atualizar").
  // % alvo da fase (back-compat: chave antiga "EFC" → "EFC FF" pro %).
  const metaPercent = useMemo(() => {
    if (fase === 'EFC') return metas?.percents?.['EFC FF'] ?? metas?.percents?.['EFC'] ?? null;
    return metas?.percents?.[fase] ?? null;
  }, [fase, metas]);
  // EFC tem 2 metas de horário (FF/Spot); EFD/TI reusam a única em metaHorarioFF.
  const metaHorarioFF = useMemo(() => {
    if (fase === 'EFC') return metas?.horarios?.['EFC FF'] ?? metas?.horarios?.['EFC'] ?? null;
    return metas?.horarios?.[fase] ?? null;
  }, [fase, metas]);
  const metaHorarioSpot = useMemo(() => {
    if (fase === 'EFC') return metas?.horarios?.['EFC Spot'] ?? null;
    return null;
  }, [fase, metas]);

  // Resolve código de motorista → "código - Nome" via mapa. Fallback: só o código.
  const labelMotorista = (cod) => {
    const c = String(cod ?? '').trim();
    if (!c) return '—';
    const cNorm = c.replace(/^0+(?=\d)/, '');
    const nome = motoristasMap[cNorm] || motoristasMap[c];
    return nome ? `${cNorm} - ${nome}` : c;
  };

  // Resolve a meta-de-horário pra UMA linha:
  //   - fase EFC + frota Padronizada → metaHorarioFF
  //   - fase EFC + qualquer outra    → metaHorarioSpot
  //   - fase EFD/TI                  → metaHorarioFF (única)
  // Encapsula essa decisão pra todas as funções de agrupar e pra calcularEFCLinha.
  const getMetaParaLinha = useCallback((linha) => {
    if (fase === 'EFC') {
      return isFrotaPadronizada(linha) ? metaHorarioFF : metaHorarioSpot;
    }
    return metaHorarioFF;
  }, [fase, metaHorarioFF, metaHorarioSpot]);

  // Calcula status EFC pra UMA linha (regra do mapaOK aplicada por linha).
  // Retorna 'OK', 'NOK' ou '—' (sem dados pra avaliar).
  const calcularEFCLinha = (l) => {
    const isoOp = toISO(l.dataOperacao);
    const isoEm = toISO(l.dataEmissao);
    if (!isoOp || !isoEm) return '—';
    if (isoOp < isoEm) return 'OK';                 // carregou antes do dia da entrega
    if (isoOp > isoEm) return 'NOK';                // depois do dia da entrega
    // Mesmo dia: depende da hora vs meta-da-linha (FF ou Spot)
    const metaStr = getMetaParaLinha(l);
    if (!metaValida(metaStr)) return '—';           // meta não cadastrada → não dá pra avaliar
    const metaMin = horaParaMinutos(metaStr);
    if (metaMin == null) return '—';
    const hMin = horaParaMinutos(l.horaOperacao);
    if (hMin == null) return '—';
    return hMin <= metaMin ? 'OK' : 'NOK';
  };

  // Linhas com filtros globais apenas (sem cross-filter, sem fase) — base para KPIs
  const linhasGlobal = useMemo(() => {
    const frotas = asLista(filtros.frota);
    return linhas.filter(l => {
      if (frotas.length > 0 && !frotas.includes(l.frotaCadastrada)) return false;
      if (filtros.dataInicio || filtros.dataFim) {
        const iso = toISO(l.dataEmissao);
        if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
        if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
      }
      return true;
    });
  }, [linhas, filtros]);

  // Linhas desta fase (filtros globais já aplicados)
  const linhasFase = useMemo(
    () => linhasGlobal.filter(l => String(l.fase ?? '').trim() === faseCodigo),
    [linhasGlobal, faseCodigo]
  );

  // Lista única de Frotas pra dropdown (derivada de todas as linhas, sem filtros)
  const uniqueFrotas = useMemo(
    () => [...new Set(linhas.map(l => (l.frotaCadastrada ?? '').trim()).filter(Boolean))].sort(),
    [linhas]
  );

  // Memos com filtro cruzado — cada chart exclui sua própria dimensão
  const dadosData       = useMemo(() => agruparEFCPorData(filtrarLinhas(linhasFase, filtros, 'data'), getMetaParaLinha, fase), [linhasFase, filtros, getMetaParaLinha, fase]);
  const dadosMes        = useMemo(() => agruparEFCPorMes(filtrarLinhas(linhasFase, filtros), getMetaParaLinha, fase),          [linhasFase, filtros, getMetaParaLinha, fase]);
  // Índices do Brush no gráfico Dia a Dia — calcula últimos N dias quando muda janela
  const brushRange      = useMemo(() => {
    const len = dadosData.length;
    if (len === 0 || janelaDias === 'mes') return null;
    const tam = janelaDias === '7' ? 7 : 15;
    const startIndex = Math.max(0, len - tam);
    const endIndex   = len - 1;
    return { startIndex, endIndex };
  }, [dadosData.length, janelaDias]);

  // Domínio dinâmico do eixo Y do gráfico "EFC por Dia" — zoom automático no
  // range visível dos dados (e da meta) pra destacar variações pequenas.
  // Arredonda pra baixo no múltiplo de 5 mais próximo, pra ficar redondo nos ticks.
  const yDomainDia = useMemo(() => {
    if (dadosData.length === 0) return [0, 100];
    const valoresEfc = dadosData.map(d => d.efc);
    // Inclui meta no cálculo: garante que a linha tracejada sempre aparece visível
    const todos = metaPercent != null ? [...valoresEfc, metaPercent] : valoresEfc;
    const min = Math.min(...todos);
    const arredondado = Math.max(0, Math.floor(min / 5) * 5);
    return [arredondado, 100];
  }, [dadosData, metaPercent]);

  // Gera ticks dinâmicos entre min e 100 com step apropriado pro range
  const yTicksDia = useMemo(() => {
    const [min] = yDomainDia;
    const range = 100 - min;
    const step  = range <= 20 ? 5 : range <= 40 ? 10 : range <= 70 ? 15 : 25;
    const ticks = [];
    for (let v = min; v <= 100; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== 100) ticks.push(100);
    return ticks;
  }, [yDomainDia]);
  const dadosMotorista  = useMemo(() => {
    const arr = agruparEFCPorMotorista(filtrarLinhas(linhasFase, filtros, 'motorista'), getMetaParaLinha, fase);
    // Resolve o nome do motorista pra mostrar "código - Nome" no eixo Y.
    return arr.map(d => ({ ...d, label: labelMotorista(d.codigo) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFase, filtros, getMetaParaLinha, motoristasMap, fase]);
  const dadosPlaca      = useMemo(() => agruparEFCPorPlaca(filtrarLinhas(linhasFase, filtros, 'placa'), getMetaParaLinha, fase), [linhasFase, filtros, getMetaParaLinha, fase]);
  // EFC por Mapa — não excluí nenhum cross-filter (mapa não é filtro hoje)
  const dadosMapa       = useMemo(() => {
    const arr = agruparEFCPorMapa(filtrarLinhas(linhasFase, filtros), getMetaParaLinha, fase);
    // Enriquece com label "mapa · placa · motorista" pra leitura rápida
    return arr.map(d => ({
      ...d,
      label: `${d.mapa}${d.placa ? `  ·  ${d.placa}` : ''}${d.motorista ? `  ·  ${labelMotorista(d.motorista)}` : ''}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFase, filtros, getMetaParaLinha, motoristasMap, fase]);
  const linhasFiltradas = useMemo(() => filtrarLinhas(linhasFase, filtros),                                   [linhasFase, filtros]);

  // Lista pra tabela de detalhamento — aplica busca livre + ordenação por coluna.
  const linhasParaTabela = useMemo(() => {
    let arr = linhasFiltradas;
    const q = busca.trim().toLowerCase();
    if (q) {
      arr = arr.filter(l => {
        const haystack = [
          l.mapa, l.placa, l.frotaCadastrada,
          l.dataEmissao, l.horaOperacao,
          l.motorista, labelMotorista(l.motorista),    // inclui nome do motorista
          calcularEFCLinha(l),                          // permite buscar "OK" ou "NOK"
          l.usuario, l.fase, l.veiculo, l.revenda,
        ].map(v => String(v ?? '').toLowerCase()).join(' ');
        return haystack.includes(q);
      });
    }
    // Comparador inteligente: data vira ISO, motorista usa o label resolvido,
    // EFC ordena por status (NOK < OK), qualquer outro usa localeCompare pt-BR.
    const cmp = (a, b) => {
      if (ordenacao.campo === 'dataEmissao') {
        return (toISO(a.dataEmissao) || '').localeCompare(toISO(b.dataEmissao) || '');
      }
      if (ordenacao.campo === 'motorista') {
        return labelMotorista(a.motorista).localeCompare(labelMotorista(b.motorista), 'pt-BR', { numeric: true });
      }
      if (ordenacao.campo === 'efc') {
        return calcularEFCLinha(a).localeCompare(calcularEFCLinha(b));
      }
      const ca = a[ordenacao.campo];
      const cb = b[ordenacao.campo];
      return String(ca ?? '').localeCompare(String(cb ?? ''), 'pt-BR', { numeric: true });
    };
    return [...arr].sort((a, b) => cmp(a, b) * (ordenacao.direcao === 'asc' ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, busca, ordenacao, motoristasMap, getMetaParaLinha]);

  function toggleOrdenacao(campo) {
    setOrdenacao(prev => prev.campo === campo
      ? { campo, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: 'asc' }
    );
  }

  // ── KPI calculations — respondem a todos os filtros incluindo cross-filter ──
  const totalMapas = useMemo(
    () => new Set(filtrarLinhas(linhas, filtros).map(l => l.mapa).filter(Boolean)).size,
    [linhas, filtros]
  );

  const mapaOK = useMemo(() => {
    // Cada linha usa sua meta correta (FF ou Spot pra EFC; única pra EFD/TI).
    const ok = new Set();
    linhasFiltradas.forEach(l => {
      if (!l.mapa) return;
      if (ehMapaOK(l, getMetaParaLinha, fase)) ok.add(l.mapa);
    });
    return ok.size;
  }, [linhasFiltradas, getMetaParaLinha, fase]);

  const mapaNOK    = useMemo(() => totalMapas - mapaOK, [totalMapas, mapaOK]);
  const efcPercent = useMemo(
    () => totalMapas > 0 ? Math.round(mapaOK / totalMapas * 100) : null,
    [mapaOK, totalMapas]
  );

  // Toggle multi-aware — Ctrl/Cmd+click adiciona/remove sem afetar os outros;
  // click normal substitui (re-click no mesmo valor limpa).
  function toggle(dim, val, event) {
    setFiltros(prev => ({ ...prev, [dim]: toggleMulti(prev[dim], val, event) }));
  }
  function setGlobal(campo, val) {
    setFiltros(prev => ({ ...prev, [campo]: val }));
  }

  const temFiltroGlobal = asLista(filtros.frota).length > 0 || filtros.dataInicio || filtros.dataFim;
  const temFiltroChart  = asLista(filtros.data).length > 0 || asLista(filtros.motorista).length > 0 || asLista(filtros.placa).length > 0;
  const temFiltro       = temFiltroGlobal || temFiltroChart;

  // ── Skeleton
  if (carregando) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <Skeleton height={10} width={80} radius={4} style={{ marginBottom: 10 }} />
            <Skeleton height={28} width={120} radius={6} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map(i => <Skeleton key={i} height={34} width={80} radius={8} />)}
          </div>
        </div>
        <Skeleton height={76} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={100} radius={D.radius} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Skeleton height={260} radius={D.radius} />
          <Skeleton height={260} radius={D.radius} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>

      {/* Estilo do Brush (recharts): escurece só a "janela clicável"
          (entre as 2 alças) pra ficar evidente o que o user pode arrastar.
          O fundo continua claro (fill={D.border} no <Brush>). */}
      <style>{`
        .recharts-brush-slide {
          fill: ${D.text};
          fill-opacity: 0.35;
          cursor: ew-resize;
        }
        .recharts-brush-slide:hover {
          fill-opacity: 0.5;
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>Gestão MDP</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>{fase}</h1>
        </div>
        <TopbarNav current={loc.pathname} />
      </div>

      {/* ── Barra de filtros globais ── */}
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: '16px 20px', boxShadow: D.shadow, marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
      }}>
        {/* Frota — multi-select (Ctrl+click pra escolher várias) */}
        <MultiSelectDropdown
          label="Frota"
          valor={filtros.frota}
          opcoes={uniqueFrotas}
          onChange={val => setGlobal('frota', val)}
          placeholderTodos="Todas as frotas"
        />

        {/* Separador visual */}
        <div style={{ width: 1, height: 36, background: D.border, alignSelf: 'flex-end', marginBottom: 2 }} />

        {/* Data de */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data de</label>
          <input
            type="date"
            className="mpd-input"
            value={filtros.dataInicio}
            onChange={e => setGlobal('dataInicio', e.target.value)}
            style={sInput}
          />
        </div>

        {/* Data até */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data até</label>
          <input
            type="date"
            className="mpd-input"
            value={filtros.dataFim}
            onChange={e => setGlobal('dataFim', e.target.value)}
            style={sInput}
          />
        </div>

        {/* Limpar filtros globais */}
        {temFiltro && (
          <button
            className="mpd-btn-clear"
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            style={{
              alignSelf: 'flex-end', padding: '7px 14px',
              background: 'none', border: `1px solid ${D.border}`, borderRadius: 8,
              cursor: 'pointer', fontSize: 12, color: D.textSec, fontFamily: D.font,
              transition: D.transition,
            }}
          >
            Limpar todos
          </button>
        )}
      </div>

      {/* ── Chips de cross-filter (cliques nos gráficos) ── */}
      {/* Cada valor selecionado vira uma chip independente; clicar no × remove só aquele */}
      {temFiltroChart && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          {asLista(filtros.data).map(v => (
            <Chip key={`data-${v}`} label={`Data: ${v}`} onClear={() => toggle('data', v)} />
          ))}
          {asLista(filtros.motorista).map(v => (
            <Chip key={`mot-${v}`} label={`Motorista: ${labelMotorista(v)}`} onClear={() => toggle('motorista', v)} />
          ))}
          {asLista(filtros.placa).map(v => (
            <Chip key={`placa-${v}`} label={`Placa: ${v}`} onClear={() => toggle('placa', v)} />
          ))}
        </div>
      )}

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard label="Mapa"      valor={totalMapas.toLocaleString('pt-BR')}                          cor={D.amber} sub="únicos" />
        <KPICard label={fase}      valor={efcPercent !== null ? `${efcPercent}%` : '—'}                cor={D.blue}  sub="eficiência" />
        <KPICard label="Meta"      valor={metaPercent !== null ? `${metaPercent}%` : '—'}              cor={D.green} sub="porcentagem" />
        <KPICard label="Mapas OK"  valor={mapaOK.toLocaleString('pt-BR')}  cor={D.green} sub="dentro da meta" />
        <KPICard label="Mapas NOK" valor={mapaNOK.toLocaleString('pt-BR')} cor={D.red}   sub="fora da meta" />
      </div>

      {/* ── Empty state / Gráficos ── */}
      {linhasFase.length === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState fase={fase} />
        </div>
      ) : (
        <>
          {/* ── Gráficos ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            <ChartCard titulo="EFC Mês a Mês" badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>visão geral</span>}>
              {dadosMes.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosMes} margin={{ top: 24, right: 12, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, 110]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                    />
                    <Tooltip content={<TooltipEFCMes />} cursor={{ fill: D.blueSoft }} />
                    {metaPercent != null && (
                      <ReferenceLine
                        y={metaPercent}
                        stroke={D.green}
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        label={{ value: `Meta ${metaPercent}%`, position: 'right', fill: D.green, fontSize: 10, fontFamily: D.font, fontWeight: 700 }}
                      />
                    )}
                    <Bar dataKey="efc" radius={[5, 5, 0, 0]} maxBarSize={48} label={{ position: 'top', formatter: v => `${v}%`, fontSize: 10, fill: D.textSec, fontFamily: D.font, fontWeight: 700 }}>
                      {dadosMes.map(d => {
                        const corBase = metaPercent != null
                          ? (d.efc >= metaPercent ? D.green : D.red)
                          : D.blue;
                        return <Cell key={d.chave} fill={corBase} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo="EFC por Dia"
              badge={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={janelaDias}
                    onChange={e => setJanelaDias(e.target.value)}
                    style={{
                      padding: '4px 24px 4px 8px',
                      border: `1px solid ${D.border}`,
                      borderRadius: 6,
                      fontSize: 11,
                      color: D.text,
                      background: `${D.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 6px center`,
                      fontFamily: D.font,
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                    }}
                  >
                    <option value="mes">Mês</option>
                    <option value="15">15 dias</option>
                    <option value="7">7 dias</option>
                  </select>
                  <span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>
                    clique no ponto para filtrar
                  </span>
                </div>
              }
            >
              {dadosData.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={brushRange ? 300 : 220}>
                  <LineChart data={dadosData} margin={{ top: 4, right: 12, left: -16, bottom: brushRange ? 56 : 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} angle={-35} textAnchor="end" interval={brushRange ? 0 : 'preserveStartEnd'} />
                    <YAxis
                      domain={yDomainDia}
                      ticks={yTicksDia}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                    />
                    <Tooltip content={<TooltipEFC />} />
                    {/* Linha tracejada verde — meta cadastrada */}
                    {metaPercent != null && (
                      <ReferenceLine
                        y={metaPercent}
                        stroke={D.green}
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        label={{
                          value: `Meta ${metaPercent}%`,
                          position: 'right',
                          fill: D.green,
                          fontSize: 10,
                          fontFamily: D.font,
                          fontWeight: 700,
                        }}
                      />
                    )}
                    {/* Linha do EFC realizado */}
                    <Line
                      type="monotone"
                      dataKey="efc"
                      stroke={D.blue}
                      strokeWidth={2.5}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const selecionado = asLista(filtros.data).includes(payload.iso);
                        return (
                          <circle
                            cx={cx} cy={cy}
                            r={selecionado ? 6 : 4}
                            fill={selecionado ? '#fff' : D.blue}
                            stroke={D.blue}
                            strokeWidth={selecionado ? 2.5 : 0}
                          />
                        );
                      }}
                      activeDot={{
                        r: 7,
                        cursor: 'pointer',
                        // Ctrl/Cmd+click adiciona ao filtro (multi); click normal substitui
                        onClick: (_, e) => {
                          const p = e?.payload || e;
                          if (p?.iso) toggle('data', p.iso, e);
                        },
                        fill: D.blue,
                        stroke: '#fff',
                        strokeWidth: 2,
                      }}
                    />
                    {/* Brush — scrollbar com janela visível quando janelaDias != 'mes' */}
                    {brushRange && (
                      <Brush
                        dataKey="label"
                        height={14}
                        y={262}
                        stroke={D.textSec}
                        fill={D.border}
                        travellerWidth={6}
                        startIndex={brushRange.startIndex}
                        endIndex={brushRange.endIndex}
                        tickFormatter={() => ''}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>

          {/* ── 3 tabelas EFC lado a lado: Mapa · Placa · Motorista ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 20,
            marginBottom: 20,
          }}>
            <TabelaEFC
              titulo="EFC por Mapa"
              colLabel="Mapa"
              dados={dadosMapa}
              getKey={d => d.mapa}
              getLabel={d => d.mapa}
              formatValor={d => d.efc === 100 ? 'OK' : 'NOK'}
              metaPercent={metaPercent}
            />
            <TabelaEFC
              titulo="EFC por Placa"
              colLabel="Placa"
              dados={dadosPlaca}
              getKey={d => d.placa}
              getLabel={d => d.placa}
              filtroAtivo={filtros.placa}
              onClick={(d, e) => toggle('placa', d.placa, e)}
              metaPercent={metaPercent}
            />
            <TabelaEFC
              titulo="EFC por Motorista"
              colLabel="Nome Motorista"
              dados={dadosMotorista}
              getKey={d => d.codigo}
              getLabel={d => d.label}
              filtroAtivo={filtros.motorista}
              onClick={(d, e) => toggle('motorista', d.codigo, e)}
              metaPercent={metaPercent}
            />
          </div>

          {/* ── Tabela ── */}
          <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${D.borderLight}`, gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: D.text, fontFamily: D.font }}>Detalhamento</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {/* Input de busca livre — filtra em qualquer coluna */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por mapa, placa, motorista, usuário…"
                    style={{ ...sInput, paddingLeft: 30, minWidth: 280 }}
                  />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: D.textMuted, pointerEvents: 'none' }}>🔎</span>
                  {busca && (
                    <button
                      onClick={() => setBusca('')}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: D.textMuted, fontSize: 14, padding: '2px 6px' }}
                      title="Limpar busca"
                    >×</button>
                  )}
                </div>
                {temFiltro && (
                  <span style={{ fontSize: 11.5, color: D.textMuted, fontFamily: D.font }}>
                    <strong style={{ color: D.red }}>filtro ativo</strong>
                  </span>
                )}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Data Emissão', campo: 'dataEmissao'     },
                      { label: 'Mapa',         campo: 'mapa'            },
                      { label: 'Frota',        campo: 'frotaCadastrada' },
                      { label: 'Placa',        campo: 'placa'           },
                      { label: 'Motorista',    campo: 'motorista'       },
                      { label: 'Hora',         campo: 'horaOperacao'    },
                      { label: 'EFC',          campo: 'efc'             },
                    ].map(({ label, campo }) => {
                      const ativo = ordenacao.campo === campo;
                      const seta  = ativo ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '↕';
                      return (
                        <th
                          key={campo}
                          onClick={() => toggleOrdenacao(campo)}
                          style={{
                            background: D.text, color: '#fff', padding: '9px 14px',
                            textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
                            fontSize: 11, fontFamily: D.font, letterSpacing: 0.3,
                            cursor: 'pointer', userSelect: 'none',
                          }}
                          title={`Ordenar por ${label}`}
                        >
                          {label}
                          <span style={{
                            marginLeft: 6, fontSize: 9,
                            color: ativo ? '#fff' : '#9ca3af',
                            opacity: ativo ? 1 : 0.5,
                          }}>{seta}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {linhasParaTabela.length === 0 ? (
                    <tr><td colSpan={7}><Vazio /></td></tr>
                  ) : (
                    linhasParaTabela.slice(0, 200).map((l, i) => {
                      const efc = calcularEFCLinha(l);
                      const corEFC = efc === 'OK' ? D.green : efc === 'NOK' ? D.red : D.textMuted;
                      const bgEFC  = efc === 'OK' ? `${D.green}1F` : efc === 'NOK' ? `${D.red}1F` : 'transparent';
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                          <td style={tdS}>{l.dataEmissao || '—'}</td>
                          <td style={tdS}>{l.mapa || '—'}</td>
                          <td style={tdS}>{l.frotaCadastrada || '—'}</td>
                          <td style={{ ...tdS, fontWeight: 600, fontFamily: D.mono, fontSize: 11 }}>{l.placa || '—'}</td>
                          <td style={tdS}>{labelMotorista(l.motorista)}</td>
                          <td style={{ ...tdS, fontFamily: D.mono, fontSize: 11 }}>{l.horaOperacao || '—'}</td>
                          <td style={tdS}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: 12,
                              background: bgEFC,
                              color: corEFC,
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: D.font,
                              letterSpacing: 0.5,
                            }}>
                              {efc}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {linhasParaTabela.length > 200 && (
              <div style={{ padding: '10px 20px', fontSize: 12, color: D.textMuted, borderTop: `1px solid ${D.borderLight}`, fontStyle: 'italic', fontFamily: D.font }}>
                Exibindo 200 de {linhasParaTabela.length.toLocaleString('pt-BR')} registros
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Exports adicionais ──────────────────────────────────────────────────────
// Helpers, tokens, estilos e componentes UI reusados pelo _TIBasePage.js
// (e por qualquer futura página MPD que precise da mesma identidade visual).
// Mantém o componente FasePage como default export — só promove o que era
// privado pra public sem mudar uso interno.
export {
  D,
  horaParaMinutos,
  parseDataBR,
  toISO,
  metaValida,
  asLista,
  toggleMulti,
  filtrarLinhas,
  FILTROS_VAZIOS,
  isFrotaPadronizada,
  sLabel,
  sInput,
  sSelect,
  TopbarNav,
  KPICard,
  ChartCard,
  Chip,
  MultiSelectDropdown,
  Skeleton,
  Vazio,
  EmptyState,
  TooltipCustom,
};
