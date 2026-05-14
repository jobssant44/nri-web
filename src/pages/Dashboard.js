import { useState, useEffect } from 'react';
import { getDocs } from 'firebase/firestore';
import { useDb } from '../utils/db';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import {
  D, intFmt,
  tdStyle,
  PageContainer, PageHeader, KPICardSecondary, ChartCard,
  Tabela, Skeleton, EmptyState,
} from '../design';

const CORES_PIE = [D.red, D.blue, D.green, D.amber, '#534AB7', D.textMuted];

function parsearData(str) {
  if (!str || !str.includes('/')) return null;
  const [d, m, y] = str.split('/');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export default function Dashboard() {
  const { colRevenda } = useDb();
  const [nris, setNris] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      const snap = await getDocs(colRevenda('nris'));
      setNris(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCarregando(false);
    }
    carregar();
  }, []);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const vencendo30 = [];
  nris.forEach(n => {
    n.produtos?.forEach(p => {
      const venc = parsearData(p.validade);
      if (venc) {
        const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff <= 30) vencendo30.push({ ...p, nf: n.notaFiscal, motorista: n.motorista });
      }
    });
  });

  const porConferente = {};
  nris.forEach(n => {
    const c = n.conferente || 'N/A';
    porConferente[c] = (porConferente[c] || 0) + 1;
  });
  const dadosConferente = Object.entries(porConferente).map(([name, value]) => ({ name, value }));

  const porOrigem = {};
  nris.forEach(n => {
    const o = n.origem || 'N/A';
    porOrigem[o] = (porOrigem[o] || 0) + 1;
  });
  const dadosOrigem = Object.entries(porOrigem)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 6);

  const porProduto = {};
  nris.forEach(n => {
    n.produtos?.forEach(p => {
      const nome = p.nomeProduto || 'N/A';
      porProduto[nome] = (porProduto[nome] || 0) + 1;
    });
  });
  const dadosProduto = Object.entries(porProduto)
    .map(([name, value]) => ({ name: name.slice(0, 20), value }))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  const porMes = {};
  nris.forEach(n => {
    if (n.dataRecebimento?.includes('/')) {
      const [, m, y] = n.dataRecebimento.split('/');
      const chave = `${m}/${y}`;
      porMes[chave] = (porMes[chave] || 0) + 1;
    }
  });
  const dadosMes = Object.entries(porMes).map(([name, value]) => ({ name, value })).slice(-6);

  const totalProdutos = nris.reduce((a, n) => a + (n.produtos?.length || 0), 0);

  // ── Tooltip Recharts em estilo do design system ─────────────────────────────
  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: D.surface, border: `1px solid ${D.border}`,
        borderRadius: 10, padding: '10px 14px', fontSize: 12,
        boxShadow: D.shadowMd, fontFamily: D.font,
      }}>
        {label && <div style={{ fontWeight: 700, marginBottom: 5, color: D.text, fontSize: 12.5 }}>{label}</div>}
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color ?? D.red, fontWeight: 600, fontFamily: D.mono, fontSize: 12 }}>
            {p.name}: {intFmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  if (carregando) {
    return (
      <PageContainer maxWidth={1400}>
        <div style={{ marginBottom: 32 }}>
          <Skeleton width={120} height={11} radius={4} style={{ marginBottom: 10 }} />
          <Skeleton width={220} height={28} radius={6} style={{ marginBottom: 8 }} />
          <Skeleton width={300} height={13} radius={4} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={108} radius={D.radius} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={280} radius={D.radius} />
          <Skeleton height={280} radius={D.radius} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Skeleton height={280} radius={D.radius} />
          <Skeleton height={280} radius={D.radius} />
        </div>
      </PageContainer>
    );
  }

  const semDados = nris.length === 0;

  return (
    <PageContainer maxWidth={1400}>
      <PageHeader
        kicker="Recebimento de Mercadoria"
        titulo="Dashboard"
        sub="Visão geral dos recebimentos e operações"
      />

      {semDados ? (
        <div style={{ background: D.surface, border: `1px solid ${D.border}`, borderRadius: D.radius, boxShadow: D.shadow }}>
          <EmptyState
            titulo="Nenhuma NRI registrada"
            descricao={<>Registre NRIs na página <strong>Nova NRI</strong> ou importe dados na página <strong>Importar</strong>.</>}
          />
        </div>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <KPICardSecondary label="Total de NRIs"      valor={intFmt(nris.length)}         cor={D.red}   />
            <KPICardSecondary label="Total de Produtos"  valor={intFmt(totalProdutos)}        cor={D.blue}  />
            <KPICardSecondary label="Vencendo em 30 dias" valor={intFmt(vencendo30.length)}    cor={D.amber} />
            <KPICardSecondary label="Conferentes ativos" valor={intFmt(Object.keys(porConferente).length)} cor={D.green} />
          </div>

          {/* ── Gráficos linha 1 ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo="NRIs por Mês">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dadosMes} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: D.redSoft }} />
                  <Bar dataKey="value" fill={D.red} radius={[5, 5, 0, 0]} name="NRIs" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="Recebimentos por Conferente">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={dadosConferente}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={78}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 11, fontFamily: D.font, fill: D.textSec }}
                  >
                    {dadosConferente.map((_, i) => (
                      <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: D.textSec, fontFamily: D.font, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Gráficos linha 2 ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard titulo="Produtos Mais Recebidos">
              <ResponsiveContainer width="100%" height={Math.min(Math.max(160, dadosProduto.length * 30), 280)}>
                <BarChart data={dadosProduto} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={D.borderLight} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: D.blueSoft }} />
                  <Bar dataKey="value" fill={D.blue} radius={[0, 5, 5, 0]} name="Qtd"
                    label={{ position: 'right', fontSize: 10, fill: D.textSec, fontFamily: D.font }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="Recebimentos por Origem">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dadosOrigem} margin={{ top: 8, right: 16, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: D.textSec, fontFamily: D.font }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: D.greenSoft }} />
                  <Bar dataKey="value" fill={D.green} radius={[5, 5, 0, 0]} name="NRIs" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Tabela de vencimento ─────────────────────────────────────── */}
          {vencendo30.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 3, height: 14, background: D.amber, borderRadius: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: D.text, fontFamily: D.font }}>
                  Produtos Vencendo em 30 dias
                </span>
                <span style={{ fontSize: 12, color: D.textSec, fontFamily: D.font }}>
                  {vencendo30.length} produto(s)
                </span>
              </div>
              <Tabela
                colunas={['Produto', 'Cód', 'Validade', 'NF', 'Motorista']}
                linhas={vencendo30}
                renderLinha={(p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.bg }}>
                    <td style={{ ...tdStyle, color: D.text, fontWeight: 600 }}>{p.nomeProduto}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono, color: D.textSec }}>{p.codProduto}</td>
                    <td style={{ ...tdStyle, color: D.amber, fontWeight: 700, fontFamily: D.mono }}>{p.validade}</td>
                    <td style={{ ...tdStyle, fontFamily: D.mono }}>{p.nf}</td>
                    <td style={tdStyle}>{p.motorista}</td>
                  </tr>
                )}
              />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
