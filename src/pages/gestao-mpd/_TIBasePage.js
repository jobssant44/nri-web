// ─────────────────────────────────────────────────────────────────────────────
// _TIBasePage.js — Base compartilhada das 3 páginas TI (Tempo Interno).
//
// Diferente do _FasePage.js (EFC/EFD), que avalia UMA fase por mapa e produz
// um % de adesão, o TI é uma métrica de DURAÇÃO que exige 3 timestamps do
// mesmo mapa do relatório 03.11.20:
//   - Entrada Cdd/Fab  → momento que o caminhão chegou na portaria
//   - PC_Fisica        → fim da prestação de conta física
//   - PC_Financeira    → fim da prestação de conta financeira
//
// Tempos calculados por mapa:
//   TI Total     = horaPC_Financeira - horaEntrada
//   TI Físico    = horaPC_Fisica     - horaEntrada
//   TI Financeiro = horaPC_Financeira - horaPC_Fisica
//
// Apenas mapas com as 3 fases preenchidas entram na análise (decisão de
// negócio: descarte mapas incompletos). Tempo negativo → exclui (erro de
// dado). Tempo > 24h → mantém (caminhão "esquecido" é dado real).
//
// Meta: cadastrada no /gestao-mpd/metas em HH:MM mas interpretada como
// DURAÇÃO máxima (ex: "00:30" = 30 min). Chaves no metas_mpd:
//   tipo "total"      → TI       (rótulos no MetasMPD: "TI")
//   tipo "fisico"     → PC Física
//   tipo "financeiro" → PC Financeira
//
// Mesmas 3 chaves servem pra % de adesão (metas_mpd.percents).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useRelatoriosMPD } from '../../context/RelatoriosMPDContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Brush,
} from 'recharts';
import {
  D, parseDataBR, toISO, metaValida, asLista, toggleMulti, FILTROS_VAZIOS,
  sLabel, sInput,
  TopbarNav, KPICard, ChartCard, Chip, MultiSelectDropdown,
  Skeleton, Vazio, EmptyState,
} from './_FasePage';

// ─── Configuração por tipo ────────────────────────────────────────────────────
const LABEL_TI = {
  total:      'TI',
  fisico:     'TI Físico',
  financeiro: 'TI Financeiro',
};

// Mapeamento tipo → chaves em metas_mpd.horarios e .percents
const METAS_TI = {
  total:      { hora: 'TI',            percent: 'TI' },
  fisico:     { hora: 'PC Física',     percent: 'PC Física' },
  financeiro: { hora: 'PC Financeira', percent: 'PC Financeira' },
};

// ─── Helpers de duração ───────────────────────────────────────────────────────

// "DD/MM/YYYY" + "HH:MM" → timestamp em ms. null se inválido.
function dataHoraToMs(dataStr, horaStr) {
  const d = parseDataBR(dataStr);
  if (!d) return null;
  const m = String(horaStr ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0).getTime();
}

// ms → "HH:MM". null/NaN/negativo → "—".
function formatarDuracaoMs(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return '—';
  const totMin = Math.round(ms / 60000);
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Meta em HH:MM interpretada como duração → ms. null se não cadastrada.
function metaDuracaoMs(metaStr) {
  if (!metaValida(metaStr)) return null;
  const m = String(metaStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60 * 1000;
}

// ─── Agrupador: junta linhas em mapas-com-3-fases ─────────────────────────────
// Cada mapa pode ter várias linhas (uma por fase). Aqui consolidamos numa
// estrutura única com os 3 timestamps. Apenas mapas COMPLETOS (3 fases) saem
// do filtro final — decisão de negócio.
function agruparMapasComFases(linhas) {
  const mapa = new Map();
  linhas.forEach(l => {
    if (!l.mapa) return;
    let cur = mapa.get(l.mapa);
    if (!cur) {
      cur = {
        mapa: l.mapa,
        placa: '',
        motorista: '',
        frotaCadastrada: '',
        dataEmissao: '',
        entradaMs: null,
        pcFisicaMs: null,
        pcFinanceiraMs: null,
        // Usuários (coluna K = "Usuário" do 03.11.20) capturados por fase:
        //   usuarioPCFisica    → alimenta filtro "Conferente" (apenas TI Físico)
        //   usuarioPCFinanceira → alimenta filtro "Caixa"     (apenas TI Financeiro)
        // TI Total não tem nenhum filtro de usuário.
        usuarioPCFisica: '',
        usuarioPCFinanceira: '',
      };
      mapa.set(l.mapa, cur);
    }
    // Captura metadados conforme aparecem em qualquer linha do mapa
    if (!cur.placa     && l.placa)     cur.placa     = l.placa;
    if (!cur.motorista && l.motorista) cur.motorista = l.motorista;
    if (!cur.frotaCadastrada && l.frotaCadastrada) cur.frotaCadastrada = l.frotaCadastrada;
    if (!cur.dataEmissao && l.dataEmissao) cur.dataEmissao = l.dataEmissao;

    // Captura timestamp da fase relevante
    const ms = dataHoraToMs(l.dataOperacao, l.horaOperacao);
    if (ms == null) return;

    const fase = String(l.fase ?? '').trim();
    if (fase === 'Entrada Cdd/Fab' || fase === 'Entrada Cdd' || fase === 'Entrada CDD/Fab') cur.entradaMs = ms;
    else if (fase === 'PC_Fisica' || fase === 'PC Fisica' || fase === 'PC Física') {
      cur.pcFisicaMs = ms;
      // Conferente = usuário da linha PC_Fisica (filtro do TI Físico)
      if (l.usuario) cur.usuarioPCFisica = String(l.usuario).trim();
    }
    else if (fase === 'PC_Financeira' || fase === 'PC Financeira') {
      cur.pcFinanceiraMs = ms;
      // Caixa = usuário da linha PC_Financeira (filtro do TI Financeiro)
      if (l.usuario) cur.usuarioPCFinanceira = String(l.usuario).trim();
    }
  });

  return [...mapa.values()].filter(m =>
    m.entradaMs != null && m.pcFisicaMs != null && m.pcFinanceiraMs != null
  );
}

// Tempo (ms) do mapa para o tipo escolhido. null se negativo (erro de dado).
function tempoDoMapa(mapa, tipo) {
  let ms;
  if (tipo === 'fisico')          ms = mapa.pcFisicaMs     - mapa.entradaMs;
  else if (tipo === 'financeiro') ms = mapa.pcFinanceiraMs - mapa.pcFisicaMs;
  else                            ms = mapa.pcFinanceiraMs - mapa.entradaMs;
  return ms < 0 ? null : ms;
}

// Mapa cumpriu meta? Sem meta cadastrada → NOK (decisão: força cadastro).
function mapaTIOK(mapa, tipo, metaMs) {
  if (metaMs == null) return false;
  const t = tempoDoMapa(mapa, tipo);
  return t != null && t <= metaMs;
}

// ─── Agregadores temporais ────────────────────────────────────────────────────
// Cada agregador retorna { ..., mediaMs, count, ok, percent } por grupo.
// mediaMs = soma dos tempos / count (média das durações)
// percent = (ok / count) * 100 com 1 casa decimal

function agruparTIPorData(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const iso = toISO(map.dataEmissao);
    if (!iso) return;
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    let cur = m.get(iso);
    if (!cur) {
      const [, mm, dd] = iso.split('-');
      cur = { iso, label: `${dd}/${mm}`, somaMs: 0, count: 0, ok: 0 };
      m.set(iso, cur);
    }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

function agruparTIPorMes(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const d = parseDataBR(map.dataEmissao);
    if (!d) return;
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let cur = m.get(chave);
    if (!cur) {
      cur = {
        chave,
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        somaMs: 0, count: 0, ok: 0,
      };
      m.set(chave, cur);
    }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

function agruparTIPorMotorista(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    const k = String(map.motorista ?? '').trim() || '—';
    let cur = m.get(k);
    if (!cur) { cur = { codigo: k, somaMs: 0, count: 0, ok: 0 }; m.set(k, cur); }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.mediaMs - a.mediaMs || b.count - a.count); // pior tempo primeiro
}

// Ranking por Conferente (chave = usuarioPCFisica). Ordenado por MELHOR tempo
// primeiro (asc). Sem piso de volume — qualquer mapa entra. Usado apenas em
// /ti-fisico. Mapas sem usuarioPCFisica caem no bucket '—'.
function agruparTIPorConferente(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    const k = String(map.usuarioPCFisica ?? '').trim() || '—';
    let cur = m.get(k);
    if (!cur) { cur = { conferente: k, somaMs: 0, count: 0, ok: 0 }; m.set(k, cur); }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.mediaMs - b.mediaMs || b.count - a.count); // MELHOR tempo primeiro
}

// Ranking por Caixa (chave = usuarioPCFinanceira). Mesma lógica do Conferente
// mas pra fase financeira. Usado apenas em /ti-financeiro.
function agruparTIPorCaixa(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    const k = String(map.usuarioPCFinanceira ?? '').trim() || '—';
    let cur = m.get(k);
    if (!cur) { cur = { caixa: k, somaMs: 0, count: 0, ok: 0 }; m.set(k, cur); }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.mediaMs - b.mediaMs || b.count - a.count); // MELHOR tempo primeiro
}

function agruparTIPorPlaca(mapas, tipo, metaMs) {
  const m = new Map();
  mapas.forEach(map => {
    const t = tempoDoMapa(map, tipo);
    if (t == null) return;
    const k = String(map.placa ?? '').trim() || '—';
    let cur = m.get(k);
    if (!cur) { cur = { placa: k, somaMs: 0, count: 0, ok: 0 }; m.set(k, cur); }
    cur.somaMs += t;
    cur.count += 1;
    if (mapaTIOK(map, tipo, metaMs)) cur.ok += 1;
  });
  return [...m.values()]
    .map(d => ({
      ...d,
      mediaMs: d.count > 0 ? d.somaMs / d.count : 0,
      percent: d.count > 0 ? Math.round((d.ok / d.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.mediaMs - a.mediaMs || b.count - a.count); // pior tempo primeiro
}

// Filtro aplicado em MAPAS (não em linhas). Diferente do filtrarLinhas
// do _FasePage.js porque aqui o filtro tem que respeitar o mapa inteiro:
// se filtrasse linha-a-linha, uma linha de Entrada Cdd/Fab sem motorista
// seria descartada por filtro de motorista, e o mapa ficaria incompleto.
// excluir: 'data' | 'motorista' | 'placa' | null — dimensão do gráfico
// proprietário (não auto-filtra).
function filtrarMapas(mapas, filtros, excluir = null) {
  const frotas      = asLista(filtros.frota);
  const conferentes = asLista(filtros.conferente);  // PC_Fisica → só TI Físico usa
  const caixas      = asLista(filtros.caixa);       // PC_Financeira → só TI Financeiro usa
  const datas       = asLista(filtros.data);
  const motoristas  = asLista(filtros.motorista);
  const placas      = asLista(filtros.placa);
  return mapas.filter(m => {
    // Globais — sempre aplicados
    if (frotas.length > 0 && !frotas.includes(m.frotaCadastrada)) return false;
    // Conferente (PC_Fisica) e Caixa (PC_Financeira) — globais, mas com
    // cross-filter exclusion no ranking proprietário (igual placa/motorista)
    if (excluir !== 'conferente' && conferentes.length > 0 && !conferentes.includes(m.usuarioPCFisica))     return false;
    if (excluir !== 'caixa'      && caixas.length      > 0 && !caixas.includes(m.usuarioPCFinanceira))      return false;
    if (filtros.dataInicio || filtros.dataFim) {
      const iso = toISO(m.dataEmissao);
      if (filtros.dataInicio && (!iso || iso < filtros.dataInicio)) return false;
      if (filtros.dataFim    && (!iso || iso > filtros.dataFim))    return false;
    }
    // Cross-filter — ignorado no gráfico próprio
    if (excluir !== 'data'      && datas.length      > 0 && !datas.includes(toISO(m.dataEmissao))) return false;
    if (excluir !== 'motorista' && motoristas.length > 0 && !motoristas.includes(m.motorista))     return false;
    if (excluir !== 'placa'     && placas.length     > 0 && !placas.includes(m.placa))             return false;
    return true;
  });
}

// Cada mapa = 1 linha. Mostra tempo e status OK/NOK.
function agruparTIPorMapa(mapas, tipo, metaMs) {
  return mapas
    .map(map => {
      const t = tempoDoMapa(map, tipo);
      return {
        mapa: map.mapa,
        placa: map.placa || '',
        motorista: map.motorista || '',
        frotaCadastrada: map.frotaCadastrada || '',
        dataEmissao: map.dataEmissao || '',
        tempoMs: t,
        ok: t != null && metaMs != null && t <= metaMs,
      };
    })
    .sort((a, b) => (b.tempoMs ?? -1) - (a.tempoMs ?? -1)); // pior tempo primeiro
}

// ─── Tabela TI por X (Mapa / Placa / Motorista) ──────────────────────────────
// Mesmas propriedades visuais da TabelaEFC, mas mostra tempo HH:MM como métrica
// principal. Cor da pílula: vermelho se média > meta, verde se ≤. Linha "Total"
// no rodapé com tempo médio ponderado (somaMs total / count total).
function TabelaTI({
  titulo, colLabel, dados, getKey, getLabel, formatValor,
  filtroAtivo, onClick, metaMs,
}) {
  const totalCount = dados.reduce((s, d) => s + (d.count || 0), 0);
  const totalSomaMs = dados.reduce((s, d) => s + (d.somaMs || 0), 0);
  const totalMediaMs = totalCount > 0 ? totalSomaMs / totalCount : 0;
  const totalAtingiu = metaMs == null ? false : totalMediaMs <= metaMs;

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  function alternarOrdem(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const dadosOrdenados = useMemo(() => {
    if (!sortKey) return dados;
    const arr = [...dados];
    arr.sort((a, b) => {
      if (sortKey === 'valor') {
        // Pra "EFC por Mapa", o valor é tempo (tempoMs); pras outras é média
        const va = a.tempoMs ?? a.mediaMs ?? 0;
        const vb = b.tempoMs ?? b.mediaMs ?? 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const va = String(getLabel(a) ?? '');
      const vb = String(getLabel(b) ?? '');
      const naMatch = va.trim().match(/^(\d+)/);
      const nbMatch = vb.trim().match(/^(\d+)/);
      if (naMatch && nbMatch && /^\d+\s*$/.test(va.trim()) && /^\d+\s*$/.test(vb.trim())) {
        return sortDir === 'asc' ? parseInt(naMatch[1]) - parseInt(nbMatch[1]) : parseInt(nbMatch[1]) - parseInt(naMatch[1]);
      }
      return sortDir === 'asc'
        ? va.localeCompare(vb, 'pt-BR', { numeric: true })
        : vb.localeCompare(va, 'pt-BR', { numeric: true });
    });
    return arr;
  }, [dados, sortKey, sortDir, getLabel]);

  function SetaOrdem({ ativo }) {
    if (!ativo) return <span style={{ fontSize: 9, color: D.textMuted, opacity: 0.5, marginLeft: 4 }}>↕</span>;
    return <span style={{ fontSize: 9, color: D.red, marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const headerCellStyle = { cursor: 'pointer', userSelect: 'none', transition: D.transition, display: 'flex', alignItems: 'center', gap: 2 };

  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
      boxShadow: D.shadow, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${D.borderLight}` }}>
        <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>{titulo}</span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 110px',
        background: D.bg, color: D.textMuted, fontSize: 10, fontWeight: 700,
        letterSpacing: 1.5, textTransform: 'uppercase', borderBottom: `1px solid ${D.borderLight}`,
      }}>
        <div onClick={() => alternarOrdem('label')} style={{ ...headerCellStyle, padding: '8px 16px', color: sortKey === 'label' ? D.text : D.textMuted }} title={`Ordenar por ${colLabel}`}>
          <span>{colLabel}</span><SetaOrdem ativo={sortKey === 'label'} />
        </div>
        <div onClick={() => alternarOrdem('valor')} style={{ ...headerCellStyle, padding: '8px 12px', justifyContent: 'center', color: sortKey === 'valor' ? D.text : D.textMuted }} title="Ordenar por tempo">
          <span>Tempo</span><SetaOrdem ativo={sortKey === 'valor'} />
        </div>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', flex: 1 }}>
        {dadosOrdenados.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: D.textMuted, fontSize: 13, fontStyle: 'italic' }}>
            Sem dados pra este período.
          </div>
        ) : (
          dadosOrdenados.map((d, i) => {
            // Pra Por Mapa: d.tempoMs (1 mapa). Pras outras: d.mediaMs (média do grupo)
            const tempo = d.tempoMs ?? d.mediaMs ?? 0;
            const atingiu = metaMs != null && tempo <= metaMs;
            const cor     = atingiu ? D.green : D.red;
            const corSoft = atingiu ? D.greenSoft : D.redSoft;
            const key     = getKey(d);
            const ativo   = asLista(filtroAtivo).includes(key);
            return (
              <div
                key={key}
                onClick={(e) => onClick && onClick(d, e)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 110px', alignItems: 'center',
                  background: ativo ? corSoft : (i % 2 === 0 ? D.surface : D.bg),
                  borderTop: i === 0 ? 'none' : `1px solid ${D.borderLight}`,
                  borderLeft: `3px solid ${cor}`,
                  cursor: onClick ? 'pointer' : 'default',
                  fontSize: 12, fontFamily: D.font, transition: D.transition,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = corSoft; }}
                onMouseLeave={e => { e.currentTarget.style.background = ativo ? corSoft : (i % 2 === 0 ? D.surface : D.bg); }}
              >
                <div style={{ padding: '8px 16px', color: D.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getLabel(d)}
                </div>
                <div style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                    background: corSoft, color: cor,
                    fontFamily: D.mono, fontWeight: 700, fontSize: 11, letterSpacing: 0.3, minWidth: 56,
                  }}>
                    {formatValor ? formatValor(d) : formatarDuracaoMs(tempo)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 110px', alignItems: 'center',
        background: D.bg, borderTop: `1px solid ${D.border}`,
        fontSize: 12, fontWeight: 700, color: D.text, letterSpacing: 0.3, fontFamily: D.font,
      }}>
        <div style={{ padding: '10px 16px' }}>Total ({totalCount} mapas)</div>
        <div style={{ padding: '6px 10px', textAlign: 'center' }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 999,
            background: totalAtingiu ? D.greenSoft : D.redSoft,
            color: totalAtingiu ? D.green : D.red,
            fontFamily: D.mono, fontWeight: 700, fontSize: 12, letterSpacing: 0.3, minWidth: 56,
          }}>
            {formatarDuracaoMs(totalMediaMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────
// Mostra % de adesão como métrica principal (mesma estética do EFC) e o tempo
// médio do agrupamento como info secundária.
function TooltipTIPercent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font, minWidth: 170 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: D.text, fontSize: 12.5 }}>{label}</div>
      <div style={{ color: D.blue, fontWeight: 700, fontFamily: D.mono, fontSize: 16, marginBottom: 2 }}>
        {d.percent.toFixed(1).replace('.', ',')}% adesão
      </div>
      <div style={{ color: D.textSec, fontFamily: D.mono, fontSize: 11 }}>
        {d.ok} OK de {d.count} mapa{d.count === 1 ? '' : 's'}
      </div>
      <div style={{ color: D.textMuted, fontFamily: D.mono, fontSize: 11, marginTop: 3 }}>
        tempo médio: {formatarDuracaoMs(d.mediaMs)}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function TIBasePage({ tipo = 'total' }) {
  const loc = useLocation();
  const faseLabel = LABEL_TI[tipo] || 'TI';
  const metasKeys = METAS_TI[tipo] || METAS_TI.total;

  // Dados compartilhados entre EFC/EFD/TI×3/Histograma — vêm do Context.
  // BUG FIX: antes o useEffect tinha `[tipo]` como dep e refazia 3 getDocs
  // toda vez que o usuário trocava entre TI Total/Físico/Financeiro. Agora
  // é 1 fetch por sessão e a troca de tipo só re-deriva memos client-side.
  const { linhas, motoristasMap, metas, pronto } = useRelatoriosMPD();
  const carregando = !pronto;

  // Estado local de UI (filtros, ordenação, busca) — não vem do servidor
  const [filtros, setFiltros]       = useState(FILTROS_VAZIOS);
  const [busca, setBusca]               = useState('');
  const [ordenacao, setOrdenacao]       = useState({ campo: 'dataEmissao', direcao: 'desc' });
  const [janelaDias, setJanelaDias]     = useState('mes');

  // Metas derivadas do Context. Memo-derivado em vez de useState+effect —
  // re-roda quando `metas` ou `tipo` mudam.
  const metaPercent = useMemo(
    () => metas?.percents?.[metasKeys.percent] ?? null,
    [metas, metasKeys.percent]
  );
  const metaHoraStr = useMemo(
    () => metas?.horarios?.[metasKeys.hora] ?? null,
    [metas, metasKeys.hora]
  );

  // Resolve código de motorista → "código - Nome"
  const labelMotorista = useCallback((cod) => {
    const c = String(cod ?? '').trim();
    if (!c) return '—';
    const cNorm = c.replace(/^0+(?=\d)/, '');
    const nome = motoristasMap[cNorm] || motoristasMap[c];
    return nome ? `${cNorm} - ${nome}` : c;
  }, [motoristasMap]);

  // Meta em ms (calculada uma vez)
  const metaMs = useMemo(() => metaDuracaoMs(metaHoraStr), [metaHoraStr]);

  // Agrupa TODOS os mapas (3 fases) uma vez — antes de filtrar.
  // Crítico: filtrar linha-a-linha antes do agrupamento descartaria mapas
  // cuja linha de Entrada Cdd/Fab não tem motorista preenchido quando o
  // filtro é "motorista=X". Por isso o filtro vai sobre o mapa consolidado.
  const todosMapas = useMemo(() => agruparMapasComFases(linhas), [linhas]);

  // Mapas filtrados (aplicando todos os filtros, sem cross-filter exclusion)
  const mapasFiltrados = useMemo(
    () => filtrarMapas(todosMapas, filtros),
    [todosMapas, filtros]
  );

  // KPIs principais (afetados por TODOS os filtros)
  const totalMapas = mapasFiltrados.length;
  const mapasOK = useMemo(
    () => mapasFiltrados.filter(m => mapaTIOK(m, tipo, metaMs)).length,
    [mapasFiltrados, tipo, metaMs]
  );
  const mapasNOK = totalMapas - mapasOK;

  // Atingimento "em tempo": média de TODOS os mapas (decisão de negócio)
  const atingimentoMs = useMemo(() => {
    if (mapasFiltrados.length === 0) return 0;
    const total = mapasFiltrados.reduce((s, m) => {
      const t = tempoDoMapa(m, tipo);
      return s + (t == null ? 0 : t);
    }, 0);
    return total / mapasFiltrados.length;
  }, [mapasFiltrados, tipo]);

  // Atingimento em %: mapasOK / totalMapas
  const atingimentoPercent = useMemo(
    () => totalMapas > 0 ? Math.round((mapasOK / totalMapas) * 1000) / 10 : 0,
    [mapasOK, totalMapas]
  );

  // Lista de frotas únicas pra dropdown
  const uniqueFrotas = useMemo(() => {
    const set = new Set();
    linhas.forEach(l => { if (l.frotaCadastrada) set.add(l.frotaCadastrada); });
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [linhas]);

  // Lista de conferentes únicos (PC_Fisica). Usado só em /ti-fisico.
  const uniqueConferentes = useMemo(() => {
    const set = new Set();
    todosMapas.forEach(m => { if (m.usuarioPCFisica) set.add(m.usuarioPCFisica); });
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [todosMapas]);

  // Lista de caixas únicos (PC_Financeira). Usado só em /ti-financeiro.
  const uniqueCaixas = useMemo(() => {
    const set = new Set();
    todosMapas.forEach(m => { if (m.usuarioPCFinanceira) set.add(m.usuarioPCFinanceira); });
    return [...set].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [todosMapas]);

  // Agregadores com cross-filter (cada gráfico exclui sua própria dimensão)
  const dadosMes = useMemo(
    () => agruparTIPorMes(filtrarMapas(todosMapas, filtros), tipo, metaMs),
    [todosMapas, filtros, tipo, metaMs]
  );

  const dadosData = useMemo(
    () => agruparTIPorData(filtrarMapas(todosMapas, filtros, 'data'), tipo, metaMs),
    [todosMapas, filtros, tipo, metaMs]
  );

  const dadosMotorista = useMemo(() => {
    const arr = agruparTIPorMotorista(filtrarMapas(todosMapas, filtros, 'motorista'), tipo, metaMs);
    return arr.map(d => ({ ...d, label: labelMotorista(d.codigo) }));
  }, [todosMapas, filtros, tipo, metaMs, labelMotorista]);

  const dadosPlaca = useMemo(
    () => agruparTIPorPlaca(filtrarMapas(todosMapas, filtros, 'placa'), tipo, metaMs),
    [todosMapas, filtros, tipo, metaMs]
  );

  const dadosMapa = useMemo(
    () => agruparTIPorMapa(filtrarMapas(todosMapas, filtros), tipo, metaMs).map(d => ({
      ...d,
      label: `${d.mapa}${d.placa ? `  ·  ${d.placa}` : ''}${d.motorista ? `  ·  ${labelMotorista(d.motorista)}` : ''}`,
    })),
    [todosMapas, filtros, tipo, metaMs, labelMotorista]
  );

  // Rankings (só TI Físico e TI Financeiro) — exclui sua própria dimensão do
  // cross-filter pra a lista continuar mostrando todos os candidatos quando
  // o user já selecionou alguém via dropdown ou click no próprio ranking.
  const dadosConferente = useMemo(
    () => tipo === 'fisico'
      ? agruparTIPorConferente(filtrarMapas(todosMapas, filtros, 'conferente'), tipo, metaMs)
      : [],
    [todosMapas, filtros, tipo, metaMs]
  );
  const dadosCaixa = useMemo(
    () => tipo === 'financeiro'
      ? agruparTIPorCaixa(filtrarMapas(todosMapas, filtros, 'caixa'), tipo, metaMs)
      : [],
    [todosMapas, filtros, tipo, metaMs]
  );

  // Domínio Y dos gráficos de % — adapta ao range visível.
  // Arredonda pra baixo no múltiplo de 5 mais próximo, pra destacar variações
  // pequenas (mesmo padrão do EFC por Dia).
  const yDomainPercent = useMemo(() => {
    if (dadosMes.length === 0 && dadosData.length === 0) return [0, 100];
    const valores = [
      ...dadosMes.map(d => d.percent),
      ...dadosData.map(d => d.percent),
    ];
    if (metaPercent != null) valores.push(metaPercent);
    const min = Math.min(...valores);
    return [Math.max(0, Math.floor(min / 5) * 5), 100];
  }, [dadosMes, dadosData, metaPercent]);

  // Brush range do gráfico Dia a Dia (últimos N dias)
  const brushRange = useMemo(() => {
    const len = dadosData.length;
    if (len === 0 || janelaDias === 'mes') return null;
    const tam = janelaDias === '7' ? 7 : 15;
    return { startIndex: Math.max(0, len - tam), endIndex: len - 1 };
  }, [dadosData.length, janelaDias]);

  // ── Filtros (handlers de toggle e set) ──
  const setGlobal = useCallback((campo, valor) => {
    setFiltros(f => ({ ...f, [campo]: valor }));
  }, []);
  const toggle = useCallback((campo, valor, event) => {
    setFiltros(f => ({ ...f, [campo]: toggleMulti(f[campo], valor, event) }));
  }, []);

  const temFiltroGlobal = !!(filtros.frota?.length || filtros.conferente?.length || filtros.caixa?.length || filtros.dataInicio || filtros.dataFim);
  const temFiltroChart  = !!(filtros.data || filtros.motorista || filtros.placa);
  const temFiltro       = temFiltroGlobal || temFiltroChart;

  // ── Tabela de detalhamento (linha-a-linha de mapas completos) ──
  const mapasParaTabela = useMemo(() => {
    let arr = mapasFiltrados;
    const q = busca.trim().toLowerCase();
    if (q) {
      arr = arr.filter(m => {
        const blob = [m.mapa, m.placa, m.motorista, labelMotorista(m.motorista), m.dataEmissao, m.frotaCadastrada]
          .join(' ').toLowerCase();
        return blob.includes(q);
      });
    }
    // Ordenação
    const { campo, direcao } = ordenacao;
    arr = [...arr].sort((a, b) => {
      let va, vb;
      if (campo === 'tempo') {
        va = tempoDoMapa(a, tipo) ?? 0;
        vb = tempoDoMapa(b, tipo) ?? 0;
      } else if (campo === 'dataEmissao') {
        va = toISO(a.dataEmissao) || '';
        vb = toISO(b.dataEmissao) || '';
      } else if (campo === 'mapa') {
        va = parseInt(a.mapa, 10) || 0;
        vb = parseInt(b.mapa, 10) || 0;
        return direcao === 'asc' ? va - vb : vb - va;
      } else {
        va = String(a[campo] ?? '');
        vb = String(b[campo] ?? '');
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return direcao === 'asc' ? va - vb : vb - va;
      }
      return direcao === 'asc'
        ? String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })
        : String(vb).localeCompare(String(va), 'pt-BR', { numeric: true });
    });
    return arr;
  }, [mapasFiltrados, busca, ordenacao, tipo, labelMotorista]);

  function alternarOrdenacao(campo) {
    setOrdenacao(o => o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: 'asc' });
  }

  // ── Renderização ──
  if (carregando) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <Skeleton height={14} width={120} radius={4} style={{ marginBottom: 8 }} />
            <Skeleton height={28} width={200} radius={6} />
          </div>
          <Skeleton height={32} width={300} radius={8} />
        </div>
        <Skeleton height={76} radius={D.radius} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} height={100} radius={D.radius} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Skeleton height={260} radius={D.radius} />
          <Skeleton height={260} radius={D.radius} />
        </div>
      </div>
    );
  }

  const mapasTotaisCount = todosMapas.length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: D.font }}>
      <style>{`
        .recharts-brush-slide { fill: ${D.text}; fill-opacity: 0.35; cursor: ew-resize; }
        .recharts-brush-slide:hover { fill-opacity: 0.5; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>Gestão MDP</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2 }}>{faseLabel}</h1>
        </div>
        <TopbarNav current={loc.pathname} />
      </div>

      {/* ── Filtros globais ── */}
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius,
        padding: '16px 20px', boxShadow: D.shadow, marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
      }}>
        <MultiSelectDropdown
          label="Frota"
          valor={filtros.frota}
          opcoes={uniqueFrotas}
          onChange={val => setGlobal('frota', val)}
          placeholderTodos="Todas as frotas"
        />
        {/* TI Físico → dropdown "Conferente" (usuário da PC_Fisica)        */}
        {/* TI Financeiro → dropdown "Caixa" (usuário da PC_Financeira)      */}
        {/* TI Total → nenhum dropdown de usuário                           */}
        {tipo === 'fisico' && (
          <MultiSelectDropdown
            label="Conferente"
            valor={filtros.conferente}
            opcoes={uniqueConferentes}
            onChange={val => setGlobal('conferente', val)}
            placeholderTodos="Todos os conferentes"
          />
        )}
        {tipo === 'financeiro' && (
          <MultiSelectDropdown
            label="Caixa"
            valor={filtros.caixa}
            opcoes={uniqueCaixas}
            onChange={val => setGlobal('caixa', val)}
            placeholderTodos="Todos os caixas"
          />
        )}
        <div style={{ width: 1, height: 36, background: D.border, alignSelf: 'flex-end', marginBottom: 2 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data de</label>
          <input type="date" className="mpd-input" value={filtros.dataInicio} onChange={e => setGlobal('dataInicio', e.target.value)} style={sInput} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={sLabel}>Data até</label>
          <input type="date" className="mpd-input" value={filtros.dataFim} onChange={e => setGlobal('dataFim', e.target.value)} style={sInput} />
        </div>
        {temFiltro && (
          <button className="mpd-btn-clear" onClick={() => setFiltros(FILTROS_VAZIOS)}
            style={{ alignSelf: 'flex-end', padding: '7px 14px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: D.textSec, fontFamily: D.font, transition: D.transition }}>
            Limpar todos
          </button>
        )}
      </div>

      {/* ── Chips de cross-filter ── */}
      {temFiltroChart && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          {asLista(filtros.data).map(v => <Chip key={`d-${v}`} label={`Data: ${v}`} onClear={() => toggle('data', v)} />)}
          {asLista(filtros.motorista).map(v => <Chip key={`m-${v}`} label={`Motorista: ${labelMotorista(v)}`} onClear={() => toggle('motorista', v)} />)}
          {asLista(filtros.placa).map(v => <Chip key={`p-${v}`} label={`Placa: ${v}`} onClear={() => toggle('placa', v)} />)}
        </div>
      )}

      {/* ── KPI cards (6) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard label="Mapas OK"      valor={mapasOK.toLocaleString('pt-BR')}             cor={D.green} sub="dentro da meta" />
        <KPICard label="Mapas NOK"     valor={mapasNOK.toLocaleString('pt-BR')}            cor={D.red}   sub="fora da meta" />
        <KPICard label="Meta tempo"    valor={metaMs != null ? formatarDuracaoMs(metaMs) : '—'}                 cor={D.blue}  sub="máximo HH:MM" />
        <KPICard label="Meta %"        valor={metaPercent != null ? `${metaPercent}%` : '—'}                    cor={D.blue}  sub="adesão alvo" />
        <KPICard label="Atingimento"   valor={totalMapas > 0 ? formatarDuracaoMs(atingimentoMs) : '—'}          cor={metaMs != null && atingimentoMs <= metaMs ? D.green : D.red} sub="tempo médio" />
        <KPICard label="Atingimento %" valor={totalMapas > 0 ? `${atingimentoPercent.toFixed(1).replace('.', ',')}%` : '—'} cor={metaPercent != null && atingimentoPercent >= metaPercent ? D.green : D.red} sub="adesão real" />
      </div>

      {/* ── Empty state / Gráficos ── */}
      {mapasTotaisCount === 0 ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState fase={faseLabel} />
        </div>
      ) : (
        <>
          {/* ── Gráficos Mês a Mês + Dia a Dia ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            <ChartCard titulo={`${faseLabel} Mês a Mês`} badge={<span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>visão geral</span>}>
              {dadosMes.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dadosMes} margin={{ top: 24, right: 12, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={yDomainPercent}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                    />
                    <Tooltip content={<TooltipTIPercent />} cursor={{ fill: D.blueSoft }} />
                    {metaPercent != null && (
                      <ReferenceLine
                        y={metaPercent}
                        stroke={D.green}
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        label={{ value: `Meta ${metaPercent}%`, position: 'right', fill: D.green, fontSize: 10, fontFamily: D.font, fontWeight: 700 }}
                      />
                    )}
                    <Bar dataKey="percent" radius={[5, 5, 0, 0]} maxBarSize={48}
                      label={{ position: 'top', formatter: v => `${v.toFixed(1).replace('.', ',')}%`, fontSize: 10, fill: D.textSec, fontFamily: D.font, fontWeight: 700 }}>
                      {dadosMes.map(d => (
                        <Cell key={d.chave} fill={metaPercent != null ? (d.percent >= metaPercent ? D.green : D.red) : D.blue} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              titulo={`${faseLabel} por Dia`}
              badge={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={janelaDias}
                    onChange={e => setJanelaDias(e.target.value)}
                    style={{
                      padding: '4px 24px 4px 8px', border: `1px solid ${D.border}`, borderRadius: 6,
                      fontSize: 11, color: D.text,
                      background: `${D.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 6px center`,
                      fontFamily: D.font, cursor: 'pointer', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                    }}
                  >
                    <option value="mes">Mês</option>
                    <option value="15">15 dias</option>
                    <option value="7">7 dias</option>
                  </select>
                  <span style={{ fontSize: 10.5, color: D.textMuted, fontFamily: D.font }}>clique no ponto para filtrar</span>
                </div>
              }
            >
              {dadosData.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dadosData} margin={{ top: 24, right: 12, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={yDomainPercent}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }}
                    />
                    <Tooltip content={<TooltipTIPercent />} cursor={{ fill: D.blueSoft }} />
                    {metaPercent != null && (
                      <ReferenceLine
                        y={metaPercent}
                        stroke={D.green}
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        label={{ value: `Meta ${metaPercent}%`, position: 'right', fill: D.green, fontSize: 10, fontFamily: D.font, fontWeight: 700 }}
                      />
                    )}
                    <Bar
                      dataKey="percent"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                      onClick={(payload, idx, e) => toggle('data', payload.iso, e)}
                      style={{ cursor: 'pointer' }}
                    >
                      {dadosData.map((d) => {
                        const ativo = asLista(filtros.data).includes(d.iso);
                        const corBase = metaPercent != null ? (d.percent >= metaPercent ? D.green : D.red) : D.blue;
                        return <Cell key={d.iso} fill={corBase} opacity={asLista(filtros.data).length === 0 || ativo ? 1 : 0.35} />;
                      })}
                    </Bar>
                    {brushRange && (
                      <Brush dataKey="label" height={18} stroke={D.border} fill={D.bg} startIndex={brushRange.startIndex} endIndex={brushRange.endIndex} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ── Tabelas lado a lado: Mapa · Placa · Motorista (+ Ranking nas páginas Físico/Financeiro) ── */}
          <div style={{
            display: 'grid',
            // 3 colunas no TI Total, 4 colunas no Físico/Financeiro (com ranking)
            gridTemplateColumns: tipo === 'total' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: 20, marginBottom: 20,
          }}>
            <TabelaTI
              titulo={`${faseLabel} por Mapa`}
              colLabel="Mapa"
              dados={dadosMapa}
              getKey={d => d.mapa}
              getLabel={d => d.mapa}
              formatValor={d => d.tempoMs == null ? '—' : formatarDuracaoMs(d.tempoMs)}
              metaMs={metaMs}
            />
            <TabelaTI
              titulo={`${faseLabel} por Placa`}
              colLabel="Placa"
              dados={dadosPlaca}
              getKey={d => d.placa}
              getLabel={d => d.placa}
              filtroAtivo={filtros.placa}
              onClick={(d, e) => toggle('placa', d.placa, e)}
              metaMs={metaMs}
            />
            <TabelaTI
              titulo={`${faseLabel} por Motorista`}
              colLabel="Nome Motorista"
              dados={dadosMotorista}
              getKey={d => d.codigo}
              getLabel={d => d.label}
              filtroAtivo={filtros.motorista}
              onClick={(d, e) => toggle('motorista', d.codigo, e)}
              metaMs={metaMs}
            />
            {/* Ranking — só nas páginas TI Físico e TI Financeiro. Ordem ASC */}
            {/* (melhor tempo primeiro) já vem do agregador. Clique aplica       */}
            {/* o filtro de Conferente / Caixa (cross-filter).                   */}
            {tipo === 'fisico' && (
              <TabelaTI
                titulo="Ranking Conferentes"
                colLabel="Conferente"
                dados={dadosConferente}
                getKey={d => d.conferente}
                getLabel={d => d.conferente}
                filtroAtivo={filtros.conferente}
                onClick={(d, e) => toggle('conferente', d.conferente, e)}
                metaMs={metaMs}
              />
            )}
            {tipo === 'financeiro' && (
              <TabelaTI
                titulo="Ranking Caixas"
                colLabel="Caixa"
                dados={dadosCaixa}
                getKey={d => d.caixa}
                getLabel={d => d.caixa}
                filtroAtivo={filtros.caixa}
                onClick={(d, e) => toggle('caixa', d.caixa, e)}
                metaMs={metaMs}
              />
            )}
          </div>

          {/* ── Tabela de detalhamento de mapas ── */}
          <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, padding: '20px 22px', boxShadow: D.shadow }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2 }}>Detalhamento dos mapas</span>
                <span style={{ fontSize: 11, color: D.textMuted, fontFamily: D.mono }}>({mapasParaTabela.length})</span>
              </div>
              <input
                type="text"
                placeholder="Buscar mapa/placa/motorista…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ ...sInput, minWidth: 240 }}
              />
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
                <thead style={{ position: 'sticky', top: 0, background: D.text, zIndex: 1 }}>
                  <tr>
                    {[
                      { campo: 'dataEmissao', label: 'Emissão' },
                      { campo: 'mapa',        label: 'Mapa' },
                      { campo: 'frotaCadastrada', label: 'Frota' },
                      { campo: 'placa',       label: 'Placa' },
                      { campo: 'motorista',   label: 'Motorista' },
                      { campo: 'tempo',       label: 'Tempo' },
                      { campo: 'status',      label: 'Status', semOrdem: true },
                    ].map(c => (
                      <th
                        key={c.campo}
                        onClick={() => !c.semOrdem && alternarOrdenacao(c.campo)}
                        style={{
                          padding: '10px 14px', textAlign: 'left',
                          color: '#fff', fontSize: 11, fontWeight: 700,
                          letterSpacing: 1, textTransform: 'uppercase',
                          cursor: c.semOrdem ? 'default' : 'pointer',
                          userSelect: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        {c.label}
                        {!c.semOrdem && (
                          <span style={{ fontSize: 9, marginLeft: 4, opacity: ordenacao.campo === c.campo ? 1 : 0.4 }}>
                            {ordenacao.campo === c.campo ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapasParaTabela.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: D.textMuted, fontStyle: 'italic' }}>Sem mapas para os filtros atuais.</td></tr>
                  ) : (
                    mapasParaTabela.map((m, i) => {
                      const t = tempoDoMapa(m, tipo);
                      const ok = mapaTIOK(m, tipo, metaMs);
                      const tdS = { padding: '8px 14px', color: D.textSec, borderTop: `1px solid ${D.borderLight}`, whiteSpace: 'nowrap', fontSize: 12, fontFamily: D.font };
                      return (
                        <tr key={`${m.mapa}-${i}`} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                          <td style={tdS}>{m.dataEmissao || '—'}</td>
                          <td style={tdS}>{m.mapa || '—'}</td>
                          <td style={tdS}>{m.frotaCadastrada || '—'}</td>
                          <td style={{ ...tdS, fontWeight: 600, fontFamily: D.mono, fontSize: 11 }}>{m.placa || '—'}</td>
                          <td style={tdS}>{labelMotorista(m.motorista)}</td>
                          <td style={{ ...tdS, fontFamily: D.mono, fontSize: 11, color: D.text }}>{formatarDuracaoMs(t)}</td>
                          <td style={tdS}>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                              background: ok ? D.greenSoft : D.redSoft,
                              color:      ok ? D.green     : D.red,
                              fontSize: 11, fontWeight: 700, fontFamily: D.font, letterSpacing: 0.5,
                            }}>
                              {metaMs == null ? '—' : (ok ? 'OK' : 'NOK')}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
