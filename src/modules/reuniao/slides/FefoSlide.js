/**
 * FefoSlide — versão "slide" (16:9) da tela Gestão de FEFO, pra ser capturada
 * como PNG e embutida no PowerPoint da Reunião.
 *
 * Desde 2026-07-12 replica a TELA REAL (planificador em tabela) em vez de um
 * dashboard de KPIs: mesmas colunas, chips de status e badges de curva da
 * GestaoFEFOPage. Recebe `dados` do fefoModulo.buscarDados() (que reusa o
 * pipeline da página): { periodo, dataContagem, linhas[], total }.
 *
 * Um slide não comporta 400+ linhas — mostra as MAX_LINHAS mais críticas
 * (prazo asc, mesmo sort default da tela), com o contador "mostrando X de Y"
 * que a própria tela tem.
 */
import { D, tdStyle } from '../../../design';
import { fmtData, fmtNum, COR } from '../../gestao-idade/gestaoIdadeHelpers';

const MAX_LINHAS = 18;

const COLUNAS = [
  'Item', 'Local', 'Rua', 'Descrição', 'Quant.', 'Hecto', 'Curva',
  'Vencimento', 'Prazo', 'Status', 'Venda Média', 'Quant. Perda', 'R$ Perda',
];

function ChipStatus({ status }) {
  if (status === 'sem-vencimento') {
    return <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: D.textMuted, fontSize: 10, fontStyle: 'italic' }}>sem vencim.</span>;
  }
  const cfg = {
    vencido:  { cor: COR.vencido,  label: 'Vencido' },
    segregar: { cor: COR.segregar, label: 'Segregar' },
    atencao:  { cor: COR.atencao,  label: 'Atenção' },
    ok:       { cor: COR.ok,       label: 'OK' },
  }[status];
  if (!cfg) return <span style={{ color: D.textMuted }}>—</span>;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: cfg.cor, color: '#fff', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

function BadgeCurva({ curva }) {
  if (!curva) return <span style={{ color: D.textMuted }}>—</span>;
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      backgroundColor: curva === 'A' ? D.greenSoft : curva === 'B' ? D.amberSoft : D.redSoft,
      color: curva === 'A' ? D.green : curva === 'B' ? D.amber : D.red,
    }}>{curva}</span>
  );
}

export default function FefoSlide({ dados }) {
  const linhas   = dados.linhas || [];
  const visiveis = linhas.slice(0, MAX_LINHAS);
  const td       = { ...tdStyle, padding: '5px 8px', fontSize: 11 };

  return (
    <div style={{ width: 1280, background: D.bg, padding: 24, boxSizing: 'border-box', fontFamily: D.font }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 3, height: 15, background: D.red, borderRadius: 2 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted }}>
              Gestão de Idade
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: D.text, margin: 0, letterSpacing: -0.8, lineHeight: 1.1 }}>
            Gestão de FEFO
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: D.textSec, fontFamily: D.mono }}>{dados.periodo}</div>
          <div style={{ fontSize: 11, color: D.textMuted, marginTop: 4 }}>Data da Contagem: <strong style={{ color: D.textSec, fontFamily: D.mono }}>{dados.dataContagem}</strong></div>
        </div>
      </div>

      {/* Contador — mesmo texto da tela ("Mostrando X de Y contagens.") */}
      <div style={{ fontSize: 11.5, color: D.textMuted, marginBottom: 8 }}>
        Mostrando <strong style={{ color: D.textSec }}>{visiveis.length}</strong> de {dados.total || 0} contagens.
      </div>

      {/* Planificador (print da tabela real) */}
      {visiveis.length === 0 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, fontSize: 12.5, color: D.textMuted, fontStyle: 'italic' }}>
          Sem contagens no período
        </div>
      ) : (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, overflow: 'hidden', boxShadow: D.shadow }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: D.font }}>
            <thead>
              <tr>
                {COLUNAS.map(c => (
                  <th key={c} style={{ background: D.text, color: '#fff', padding: '6px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10.5 }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={i} style={{ background: i % 2 ? D.bg : '#fff' }}>
                  <td style={{ ...td, fontFamily: D.mono, fontWeight: 700 }}>{l.productCode}</td>
                  <td style={td}>{l.local || '—'}</td>
                  <td style={{ ...td, fontFamily: D.mono }}>{l.rua || '—'}</td>
                  <td style={{ ...td, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(l.quantidadeCx, 0)}</td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right' }}>{fmtNum(l.hectoTotal, 2)}</td>
                  <td style={td}><BadgeCurva curva={l.curva} /></td>
                  <td style={{ ...td, fontFamily: D.mono }}>{fmtData(l.vencimento)}</td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right' }}>{l.prazo != null ? `${l.prazo}d` : '—'}</td>
                  <td style={td}><ChipStatus status={l.status} /></td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right' }}>
                    {l.vendaMediaCxDia > 0 ? `${Math.round(l.vendaMediaCxDia)} cx/dia` : '—'}
                  </td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right', color: l.quantPerda > 0 ? D.red : D.textMuted, fontWeight: l.quantPerda > 0 ? 700 : 400 }}>
                    {fmtNum(l.quantPerda, 0)}
                  </td>
                  <td style={{ ...td, fontFamily: D.mono, textAlign: 'right', color: l.rsPerda > 0 ? D.red : D.textMuted, fontWeight: l.rsPerda > 0 ? 700 : 400 }}>
                    {l.rsPerda == null
                      ? '—'
                      : `R$ ${l.rsPerda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Factory: retorna o elemento pronto pra capturarParaPNG(). */
export function elementoFefoSlide(dados) {
  return <FefoSlide dados={dados} />;
}
