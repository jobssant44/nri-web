/**
 * Página Reunião — gera apresentação .pptx com os módulos e blocos selecionados.
 *
 * Estrutura hierárquica:
 *   - Cada módulo (WQI, Troca, …) tem N blocos (1 bloco = 1 slide do .pptx).
 *   - Estado: `selecao = { [moduloKey]: Set<blocoKey> }` (Map<string, Set<string>>).
 *   - Toggle no nome do módulo marca/desmarca TODOS os blocos daquele módulo.
 *   - Toggle num bloco individual marca/desmarca só aquele.
 *   - Cabeçalho do módulo mostra "X/N" pra contar blocos ativos.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  D, sInput,
  PageContainer, PageHeader,
} from '../../design';
import { useDb } from '../../utils/db';
import { useUser } from '../../context/UserContext';
import {
  gerarReuniaoPPT, MODULOS_DISPONIVEIS, blocosDefault,
} from '../../modules/reuniao/geradorPPT';

// Estado inicial: pra cada módulo disponível, todos os blocos `padrao: true` selecionados.
function selecaoInicial() {
  const m = {};
  MODULOS_DISPONIVEIS.forEach(mod => {
    if (mod.disponivel) {
      m[mod.key] = new Set(blocosDefault(mod));
    }
  });
  return m;
}

export default function ReuniaoPage() {
  const { col, colRevenda, docRef, rid } = useDb();
  const { empresa } = useUser();

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [dataInicio, setDataInicio] = useState(toIso(inicioMes));
  const [dataFim,    setDataFim]    = useState(toIso(hoje));
  // selecao: { [moduloKey]: Set<blocoKey> }
  const [selecao, setSelecao]       = useState(selecaoInicial);
  // expandidos: Set<moduloKey> — só os disponíveis começam expandidos
  const [expandidos, setExpandidos] = useState(
    () => new Set(MODULOS_DISPONIVEIS.filter(m => m.disponivel).map(m => m.key))
  );
  const [gerando, setGerando]   = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro]         = useState('');
  const [sucesso, setSucesso]   = useState(null);

  function toggleExpandido(moduloKey) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(moduloKey)) next.delete(moduloKey);
      else                     next.add(moduloKey);
      return next;
    });
  }

  // Toggle o módulo inteiro: se algum bloco está ativo, desmarca todos;
  // senão, marca todos os blocos do módulo.
  function toggleModulo(modulo) {
    if (!modulo.disponivel) return;
    setSelecao(prev => {
      const blocosAtivos = prev[modulo.key] || new Set();
      const next = { ...prev };
      if (blocosAtivos.size > 0) {
        next[modulo.key] = new Set(); // desmarca tudo
      } else {
        next[modulo.key] = new Set(Object.keys(modulo.blocos)); // marca tudo
      }
      return next;
    });
  }

  function toggleBloco(moduloKey, blocoKey) {
    setSelecao(prev => {
      const set = new Set(prev[moduloKey] || []);
      if (set.has(blocoKey)) set.delete(blocoKey);
      else                   set.add(blocoKey);
      return { ...prev, [moduloKey]: set };
    });
  }

  async function gerar() {
    setErro(''); setSucesso(null); setProgresso('Iniciando…');
    setGerando(true);
    try {
      // Converte Set → array pra serializar
      const selecaoPlana = {};
      Object.entries(selecao).forEach(([k, s]) => { selecaoPlana[k] = [...s]; });

      const r = await gerarReuniaoPPT({
        selecao: selecaoPlana,
        dataInicio,
        dataFim,
        deps: { col, colRevenda, docRef, rid },
        empresa: empresa?.nome || 'WJS',
        onProgress: msg => setProgresso(msg),
      });
      setSucesso(r);
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
      setProgresso('');
    }
  }

  // Total de slides previsto (sem capa+sumário, só pros badges)
  const totalSlidesPrevistos = Object.values(selecao).reduce((s, set) => s + set.size, 0);

  return (
    <PageContainer maxWidth={900}>
      <PageHeader
        kicker="Apresentações"
        titulo="Reunião"
        sub="Gere uma apresentação PowerPoint com os indicadores do período. Cada bloco marcado vira 1 slide."
      />

      {/* Card Período */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={barrinha} />
          <span style={cardTitle}>Período</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Campo label="Data de">
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={sInput} disabled={gerando} />
          </Campo>
          <Campo label="Data até">
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={sInput} disabled={gerando} />
          </Campo>
        </div>
      </div>

      {/* Card Módulos */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={barrinha} />
          <span style={cardTitle}>Módulos e blocos a incluir</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: D.textMuted }}>
            {totalSlidesPrevistos} slide{totalSlidesPrevistos === 1 ? '' : 's'} de conteúdo
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODULOS_DISPONIVEIS.map(m => (
            <ItemModulo
              key={m.key}
              modulo={m}
              blocosAtivos={selecao[m.key] || new Set()}
              expandido={expandidos.has(m.key)}
              gerando={gerando}
              onToggleExpand={() => toggleExpandido(m.key)}
              onToggleModulo={() => toggleModulo(m)}
              onToggleBloco={(blocoKey) => toggleBloco(m.key, blocoKey)}
            />
          ))}
        </div>
      </div>

      {/* Botão gerar + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
        <button
          onClick={gerar}
          disabled={gerando || totalSlidesPrevistos === 0}
          style={{
            padding: '12px 24px',
            backgroundColor: gerando ? D.textMuted : D.red,
            color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: gerando || totalSlidesPrevistos === 0 ? 'not-allowed' : 'pointer',
            opacity: totalSlidesPrevistos === 0 ? 0.6 : 1,
            fontFamily: D.font, transition: D.transition,
            boxShadow: D.shadow,
          }}
        >
          {gerando ? '⏳ Gerando…' : '📊 Gerar Apresentação'}
        </button>
        {gerando && progresso && (
          <span style={{ fontSize: 13, color: D.textSec, fontFamily: D.font }}>
            {progresso}
          </span>
        )}
      </div>

      {erro && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: D.redSoft, color: D.red,
          borderRadius: 8, border: `1px solid ${D.redBorder}`,
          borderLeft: `4px solid ${D.red}`,
          fontSize: 13, fontFamily: D.font,
        }}>
          ❌ {erro}
        </div>
      )}

      {sucesso && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: D.greenSoft, color: D.green,
          borderRadius: 8, border: `1px solid ${D.greenBorder}`,
          borderLeft: `4px solid ${D.green}`,
          fontSize: 13, fontFamily: D.font,
        }}>
          ✅ <strong>{sucesso.nomeArquivo}</strong> gerado com {sucesso.qtdSlides} slide(s). O download começou automaticamente.
        </div>
      )}
    </PageContainer>
  );
}

// ─── Item de módulo (com sub-blocos) ─────────────────────────────────────────
function ItemModulo({ modulo, blocosAtivos, expandido, gerando, onToggleExpand, onToggleModulo, onToggleBloco }) {
  const totalBlocos = Object.keys(modulo.blocos || {}).length;
  const cor         = corPorChave(modulo.cor);
  const algumAtivo  = blocosAtivos.size > 0;
  const todosAtivos = totalBlocos > 0 && blocosAtivos.size === totalBlocos;
  const disabled    = !modulo.disponivel || gerando;
  const Chevron     = expandido ? ChevronDown : ChevronRight;

  return (
    <div style={{
      border: `1.5px solid ${algumAtivo ? cor : D.border}`,
      borderRadius: 8, background: algumAtivo ? '#fef9f9' : D.surface,
      transition: D.transition, opacity: modulo.disponivel ? 1 : 0.55,
    }}>
      {/* Header do módulo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        cursor: modulo.disponivel ? 'pointer' : 'not-allowed',
      }}>
        {/* Setinha (clica → expande/colapsa, sem mexer no toggle) */}
        {modulo.disponivel && totalBlocos > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, color: D.textSec, display: 'flex',
            }}
            aria-label={expandido ? 'Colapsar' : 'Expandir'}
          >
            <Chevron size={16} />
          </button>
        )}
        {/* Checkbox + nome (clica → toggle módulo inteiro) */}
        <div
          onClick={onToggleModulo}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            flex: 1, minWidth: 0,
          }}
        >
          <input
            type="checkbox"
            checked={algumAtivo}
            ref={el => { if (el) el.indeterminate = algumAtivo && !todosAtivos; }}
            disabled={disabled}
            readOnly
            style={{ accentColor: cor, cursor: 'inherit', width: 16, height: 16 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: D.text, fontFamily: D.font }}>
              {modulo.label}
            </div>
            {!modulo.disponivel && (
              <div style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>Em breve</div>
            )}
          </div>
          {modulo.disponivel && (
            <div style={{
              fontSize: 11, fontFamily: D.mono,
              color: algumAtivo ? cor : D.textMuted, fontWeight: 700,
            }}>
              {blocosAtivos.size}/{totalBlocos}
            </div>
          )}
        </div>
      </div>

      {/* Sub-blocos (mostra só se expandido e disponível) */}
      {modulo.disponivel && expandido && totalBlocos > 0 && (
        <div style={{
          borderTop: `1px solid ${D.borderLight}`,
          padding: '8px 14px 12px 36px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {Object.entries(modulo.blocos).map(([blocoKey, bloco]) => {
            const ativo = blocosAtivos.has(blocoKey);
            return (
              <label
                key={blocoKey}
                onClick={() => !gerando && onToggleBloco(blocoKey)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: gerando ? 'not-allowed' : 'pointer',
                  padding: '4px 0', fontSize: 13,
                  color: ativo ? D.text : D.textSec,
                  fontFamily: D.font,
                }}
              >
                <input
                  type="checkbox" checked={ativo} disabled={gerando} readOnly
                  style={{ accentColor: cor, cursor: 'inherit', width: 14, height: 14 }}
                />
                <span>{bloco.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes locais ──────────────────────────────────────────────────
function Campo({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 2,
        textTransform: 'uppercase', color: D.textMuted,
        marginBottom: 6, fontFamily: D.font,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function corPorChave(k) {
  return ({
    red:   D.red,
    blue:  D.blue,
    amber: D.amber,
    green: D.green,
  })[k] || D.red;
}

// ─── estilos locais ──
const cardStyle = {
  background: D.surface,
  border: `1px solid ${D.border}`,
  borderRadius: D.radius,
  padding: 20,
  boxShadow: D.shadow,
  marginBottom: 16,
};
const cardHeader = {
  display: 'flex', alignItems: 'center', gap: 10,
  marginBottom: 16,
};
const barrinha = {
  width: 3, height: 14, background: D.red, borderRadius: 2,
};
const cardTitle = {
  fontSize: 13, fontWeight: 700, color: D.text, letterSpacing: -0.2, fontFamily: D.font,
};
