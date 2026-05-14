// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES — Design system WJS
//
// Componentes reutilizáveis que seguem o padrão visual definido em WQIPage.
// Importe diretamente: `import { KPICardPrimary, ChartCard } from '../../design'`.
//
// REGRAS:
//   - Não receba "style" como prop pra sobrescrever — se precisar variante,
//     adicione prop semântica nova (ex: `destaque`, `cor`).
//   - Sempre use tokens (D) e styles (sLabel, sInput, etc.). NÃO hardcode cores.
// ─────────────────────────────────────────────────────────────────────────────

import { D } from './tokens';
import { brl } from './utils';
import { sLabel, sInput, sBtnClear, sBtnNav, tdStyle } from './styles';

// ── PageHeader ────────────────────────────────────────────────────────────────
/** Cabeçalho padrão de página: barra vertical vermelha + label uppercase + H1.
 *  Props:
 *    - kicker:  texto pequeno em uppercase acima do título (ex: "Gestão de Prejuízo")
 *    - titulo:  H1 da página
 *    - sub:     parágrafo abaixo (opcional)
 *    - acoes:   ReactNode renderizado no canto direito (botões de navegação)
 */
export function PageHeader({ kicker, titulo, sub, acoes }) {
  return (
    <div style={{ marginBottom: 28, animation: 'wjs-fadeUp 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          {kicker && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 3, height: 16, background: D.red, borderRadius: 2 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font }}>
                {kicker}
              </span>
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.2, fontFamily: D.font }}>
            {titulo}
          </h1>
          {sub && (
            <p style={{ fontSize: 12, color: D.textMuted, margin: '6px 0 0', fontFamily: D.font }}>
              {sub}
            </p>
          )}
        </div>
        {acoes && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{acoes}</div>}
      </div>
    </div>
  );
}

// ── KPICardPrimary ────────────────────────────────────────────────────────────
/** Card de KPI grande (usado nos dois primeiros KPIs da página).
 *  Props:
 *    - label: rótulo uppercase
 *    - valor: string formatada (ex: brl(123))
 *    - cor:   cor do destaque (border)
 *    - sub:   texto secundário (ex: "Meta − R$ Perda")
 *    - destaque: se true, card colorido sólido em vez de branco
 */
export function KPICardPrimary({ label, valor, cor, sub, destaque }) {
  return (
    <div style={{
      background: destaque ? cor : D.surface,
      border: `1px solid ${destaque ? cor : D.border}`,
      borderRadius: D.radius,
      padding: '28px 28px 24px',
      boxShadow: destaque ? `0 4px 24px ${cor}22` : D.shadow,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: 120, animation: 'wjs-fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: destaque ? 'rgba(255,255,255,0.7)' : D.textMuted, fontFamily: D.font, marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: destaque ? '#ffffff' : D.text, fontFamily: D.mono, letterSpacing: -1.5, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: destaque ? 'rgba(255,255,255,0.55)' : D.textMuted, marginTop: 8, fontFamily: D.font }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── KPICardSecondary ──────────────────────────────────────────────────────────
/** Card de KPI secundário (linha de 3 ou mais embaixo).
 *  Props iguais ao KPICardPrimary, mas sem `destaque`. Borda esquerda colorida.
 */
export function KPICardSecondary({ label, valor, cor, sub }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '18px 20px', boxShadow: D.shadow,
      animation: 'wjs-fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: -0.8, lineHeight: 1 }}>
        {valor}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: D.textMuted, marginTop: 6, fontFamily: D.font }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── ChartCard ─────────────────────────────────────────────────────────────────
/** Wrapper de card para gráficos Recharts.
 *  Props:
 *    - titulo: string do título
 *    - badge:  ReactNode opcional no canto direito (ex: select de Top N)
 *    - children: o gráfico em si
 */
export function ChartCard({ titulo, badge, children }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: D.radius, padding: '22px 24px', boxShadow: D.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 14, background: D.red, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font }}>
            {titulo}
          </span>
        </div>
        {badge}
      </div>
      <div style={{ borderTop: `1px solid ${D.borderLight}`, paddingTop: 18 }}>
        {children}
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────
/** Container horizontal de filtros (card branco com flex-wrap).
 *  Props:
 *    - children: os campos de filtro (cada um em <FilterField>)
 */
export function FilterBar({ children }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: D.radius, padding: '14px 20px', boxShadow: D.shadow,
      marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
    }}>
      {children}
    </div>
  );
}

/** Campo individual da FilterBar (label uppercase em cima + input embaixo) */
export function FilterField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={sLabel}>{label}</label>
      {children}
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
/** Tag pequena com botão de fechar (filtros ativos).
 *  Props: label, onClear, tom ('red' | 'blue'). Padrão: red.
 */
export function Chip({ label, onClear, tom = 'red' }) {
  const cor    = tom === 'blue' ? D.blue       : D.red;
  const fundo  = tom === 'blue' ? D.blueSoft   : D.redSoft;
  const borda  = tom === 'blue' ? D.blueBorder : D.redBorder;
  return (
    <div className="wjs-chip" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 8px 5px 11px',
      background: fundo, border: `1px solid ${borda}`,
      borderRadius: 8, fontSize: 11.5, color: cor, fontWeight: 600,
      fontFamily: D.font, cursor: 'default', transition: D.transition,
    }}>
      {label}
      {onClear && (
        <button onClick={onClear} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: cor, fontSize: 12, lineHeight: 1,
          padding: '1px 3px', borderRadius: 4, opacity: 0.7, transition: D.transition,
        }}>
          ✕
        </button>
      )}
    </div>
  );
}

// ── Tabela ────────────────────────────────────────────────────────────────────
/** Tabela padrão (header dark + zebrado). Props:
 *    - colunas:   array de strings com nomes das colunas
 *    - linhas:    array de dados
 *    - renderLinha: (linha, i) => <tr>...</tr>
 *    - vazio:     texto exibido quando linhas.length === 0
 */
export function Tabela({ colunas, linhas, renderLinha, vazio = 'Sem registros' }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow,
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: D.font }}>
          <thead>
            <tr>
              {colunas.map(c => (
                <th key={c} style={{
                  background: D.text, color: '#fff', padding: '9px 14px',
                  textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
                  fontSize: 11, letterSpacing: 0.3,
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0
              ? <tr><td colSpan={colunas.length} style={{ textAlign: 'center', padding: 28, color: D.textMuted, fontStyle: 'italic' }}>{vazio}</td></tr>
              : linhas.map((l, i) => renderLinha(l, i))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TooltipBRL ────────────────────────────────────────────────────────────────
/** Tooltip customizado pro Recharts formatando valores em BRL. */
export function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderRadius: 10, padding: '10px 14px',
      fontSize: 12, boxShadow: D.shadowMd, fontFamily: D.font,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
          {p.name}: {brl(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
/** Bloco de loading com animação shimmer. */
export function Skeleton({ width = '100%', height = 20, radius = 6, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'wjs-shimmer 1.6s ease-in-out infinite',
      ...style,
    }} />
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
/** Estado vazio com ícone, título e descrição. Use quando NÃO HÁ DADOS no Firebase
 *  (não confundir com Vazio que é "filtro sem resultado").
 *  Props:
 *    - titulo:    H2 ("Nenhum dado de WQI importado")
 *    - descricao: texto secundário ou ReactNode
 *    - icone:     SVG opcional (path string). Padrão: ícone de documento.
 */
export function EmptyState({ titulo, descricao, icone }) {
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center', animation: 'wjs-fadeUp 0.4s ease both' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: D.redSoft, border: `1px solid ${D.redBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={icone ||
            'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
          } />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8, fontFamily: D.font }}>
        {titulo}
      </div>
      {descricao && (
        <div style={{ fontSize: 13, color: D.textSec, maxWidth: 300, margin: '0 auto', lineHeight: 1.6, fontFamily: D.font }}>
          {descricao}
        </div>
      )}
    </div>
  );
}

// ── Vazio ─────────────────────────────────────────────────────────────────────
/** Estado vazio compacto pra gráficos/tabelas filtradas sem resultado.
 *  Diferente do EmptyState (que é "sem dados no Firebase").
 */
export function Vazio({ mensagem = 'Sem dados para o filtro selecionado' }) {
  return (
    <div style={{
      height: 120, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <svg width="24" height="24" fill="none" stroke={D.textMuted} strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <span style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.font, fontStyle: 'italic' }}>
        {mensagem}
      </span>
    </div>
  );
}

// ── BotaoVoltar ───────────────────────────────────────────────────────────────
/** Botão "← Voltar" padrão para sub-páginas. */
export function BotaoVoltar({ onClick, label = 'Voltar' }) {
  return (
    <button className="wjs-btn-voltar" onClick={onClick} style={{
      background: 'none', border: `1px solid ${D.border}`, borderRadius: 8,
      cursor: 'pointer', color: D.textSec, fontSize: 12,
      padding: '7px 14px', fontWeight: 500, fontFamily: D.font,
      display: 'flex', alignItems: 'center', gap: 6, transition: D.transition,
    }}>
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
      </svg>
      {label}
    </button>
  );
}

// ── BotaoNav ──────────────────────────────────────────────────────────────────
/** Botão de navegação secundário (usado no header de uma página pra abrir sub-páginas). */
export function BotaoNav({ onClick, children }) {
  return (
    <button className="wjs-btn-nav" onClick={onClick} style={sBtnNav}>
      {children}
    </button>
  );
}

// ── BotaoClear ────────────────────────────────────────────────────────────────
/** Botão "Limpar filtros" (variante outline cinza, hover vira vermelho). */
export function BotaoClear({ onClick, children = 'Limpar filtros' }) {
  return (
    <button className="wjs-btn-clear" onClick={onClick} style={sBtnClear}>
      {children}
    </button>
  );
}

// ── MiniRanking ───────────────────────────────────────────────────────────────
/** Card com barra horizontal proporcional (Top N de algo).
 *  Props:
 *    - titulo: rótulo do card
 *    - itens:  [{ label, valor }]
 *    - cor:    cor das barras
 *    - max:    valor máximo (para escala). Se omitido, usa o maior valor.
 *    - formatador: função opcional pra formatar valor (default brl)
 */
export function MiniRanking({ titulo, itens, cor, max, formatador = brl }) {
  const escala = max ?? (itens[0]?.valor || 1);
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: D.radius,
      padding: '20px', boxShadow: D.shadow,
      animation: 'wjs-fadeUp 0.4s ease both',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: D.textMuted, fontFamily: D.font, marginBottom: 12 }}>
        {titulo}
      </div>
      {itens.length === 0 ? (
        <div style={{ fontSize: 11, color: D.textMuted, fontStyle: 'italic', fontFamily: D.font }}>
          Sem dados
        </div>
      ) : (
        itens.map(({ label, valor }) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, fontFamily: D.font }}>
              <span style={{ color: D.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                {label}
              </span>
              <span style={{ color: cor, fontWeight: 700, flexShrink: 0, marginLeft: 4, fontFamily: D.mono }}>
                {formatador(valor)}
              </span>
            </div>
            <div style={{ height: 3, background: D.borderLight, borderRadius: 2 }}>
              <div style={{ height: 3, width: `${(valor / escala) * 100}%`, background: cor, borderRadius: 2 }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── PageContainer ─────────────────────────────────────────────────────────────
/** Container raiz padrão de página (maxWidth + fonte). */
export function PageContainer({ children, maxWidth = 1200 }) {
  return (
    <div style={{ maxWidth, margin: '0 auto', fontFamily: D.font }}>
      {children}
    </div>
  );
}

// Re-export do tdStyle pra conveniência (já vem de styles.js)
export { tdStyle };
