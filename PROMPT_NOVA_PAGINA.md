# Prompt Padrão — Nova Página de Dashboard

Use este prompt ao solicitar a criação de qualquer nova página de análise/dashboard neste projeto.

---

## Prompt base

```
Crie uma nova página de dashboard React para o projeto NRI (C:\Users\REVENDACBM\Documents\Projeto NRI\nri-web).

### Contexto do projeto
- React SPA (Create React App), 100% inline styles — sem Tailwind, sem CSS modules
- Firebase Firestore como banco de dados
- Recharts para gráficos (BarChart, LineChart, PieChart via ResponsiveContainer)
- Sem Redux, sem Context API — estado local com useState/useMemo
- Arquivo de configuração do Firebase: src/firebaseConfig.js

### Dados e coleção Firebase
[DESCREVA AQUI]
- Coleção: `nome_da_colecao`
- Campos relevantes: campo1, campo2, campo3...
- Filtros de pré-importação (se houver): ex. Operação = 5, Status = A

### KPIs (cards de métricas)
[DESCREVA OS CARDS]
- Layout bento assimétrico:
  - Linha 1: 2 cards primários em destaque (grid 1fr 1fr)
  - Linha 2: N cards secundários de suporte (grid repeat(N, 1fr))
- Cards primários: fundo colorido sólido com shadow colorido, valor em fonte mono grande
- Cards secundários: fundo branco com borda lateral colorida (borderLeft: 3px solid cor)
- KPIs NÃO são afetados por cliques nos gráficos — usam base de dados separada (só filtros de barra)

### Gráficos
[DESCREVA OS GRÁFICOS]
Ex.:
- Gráfico A: Barras horizontais por [dimensão], cor azul #1D5A9E
- Gráfico B: Barras horizontais por [dimensão], cor vermelha #E31837
- Gráfico C: Barras verticais por Mês, cor âmbar #b45309, largura total
- Gráfico D: Linha por Dia, cor verde #15803d, largura total

### Filtro cruzado entre gráficos (OBRIGATÓRIO)
Implemente filtro cruzado simétrico entre TODOS os gráficos:
- Clicar numa barra/ponto filtra todos os outros gráficos, exceto o próprio
- Clicar no mesmo item novamente desfaz o filtro (toggle)
- KPI cards NÃO são afetados pelos filtros de gráfico
- Usar o padrão filtrarLinhas() com parâmetro `excluir`:

  function filtrarLinhas(linhas, { excluir, filtroA, filtroB, filtroC, filtroD }) {
    return linhas.filter(l => {
      if (excluir !== 'a' && filtroA && getA(l) !== filtroA) return false;
      if (excluir !== 'b' && filtroB && getB(l) !== filtroB) return false;
      if (excluir !== 'c' && filtroC && getC(l) !== filtroC) return false;
      if (excluir !== 'd' && filtroD && getD(l) !== filtroD) return false;
      return true;
    });
  }

- Cada gráfico tem seu próprio useMemo excluindo o próprio filtro:
  const linhasParaA = useMemo(
    () => filtrarLinhas(base, { excluir: 'a', filtroA, filtroB, filtroC, filtroD }),
    [base, filtroB, filtroC, filtroD]
  );

- Para gráficos de barras (BarChart): onClick no elemento <Bar>, handler recebe data entry diretamente (data.campo)
- Para gráfico de linha (LineChart): onClick via activeDot={{ onClick: (e, payload) => handler(e, payload) }}, lê payload.payload.campo
- Para barras verticais de categoria: onClick no <Bar>, handler recebe data entry diretamente

### Remoção do outline ao clicar nos gráficos
Injetar via tag <style> no início da página (antes do return):

  const STYLE_TAG_ID = 'pagina-styles';
  if (!document.getElementById(STYLE_TAG_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_TAG_ID;
    st.textContent = `
      .recharts-wrapper,
      .recharts-wrapper svg,
      .recharts-wrapper *:focus,
      .recharts-surface { outline: none !important; }
      @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(st);
  }

### Design system — tokens obrigatórios
Usar exatamente estes tokens:

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
    amber:       '#b45309',
    amberSoft:   'rgba(180,83,9,0.07)',
    green:       '#15803d',
    greenSoft:   'rgba(21,128,61,0.07)',
    shadow:      '0 1px 2px rgba(15,23,42,0.03), 0 4px 16px rgba(15,23,42,0.04)',
    shadowMd:    '0 2px 8px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)',
    radius:      14,
    font:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
    mono:        "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    transition:  'all 0.22s cubic-bezier(0.16,1,0.3,1)',
  };

### Regras de design (Taste Skill aplicado)
- NUNCA use emojis — substituir por SVG inline
- Tipografia com hierarquia: labels em uppercase + letterSpacing alto, valores em fonte mono
- Cabeçalho da página: linha vertical vermelha (4px) + breadcrumb uppercase muted + H1 bold
- Cards: fundo branco, border 1px #e2e8f0, borderRadius 14, shadow diffusion suave
- ChartCard: título com linha vermelha vertical (3px) à esquerda, separador borderTop abaixo do header
- Filtros ativos: chips com fundo redSoft + borda redBorder, botão ✕ inline
- Gráficos inativos (não selecionados): opacity 0.18 nas barras via <Cell>
- Gráficos selecionados: opacity 1
- Transições: cubic-bezier(0.16,1,0.3,1) em todos os elementos interativos

### Estado de carregamento
Usar skeleton shimmer em vez de spinner:

  function Skeleton({ width = '100%', height = 20, radius = 6, style = {} }) {
    return (
      <div style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, #f1f5f9 25%, #e8edf2 50%, #f1f5f9 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
        ...style,
      }} />
    );
  }

  // No return do carregando:
  if (carregando) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Skeleton height={28} radius={6} style={{ marginBottom: 20, width: 200 }} />
        <Skeleton height={60} radius={14} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Skeleton height={120} radius={14} />
          <Skeleton height={120} radius={14} />
        </div>
        <Skeleton height={260} radius={14} />
      </div>
    );
  }

### Estado vazio (sem dados importados)
Usar SVG + texto contextual, sem emojis:

  function EmptyState() {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: D.redSoft,
          border: `1px solid ${D.redBorder}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="26" height="26" fill="none" stroke={D.red} strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5
                 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5
                 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125
                 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8 }}>
          Nenhum dado importado
        </div>
        <div style={{ fontSize: 13, color: D.textSec, maxWidth: 300, margin: '0 auto', lineHeight: 1.6 }}>
          Importe o relatório em <strong>Importar relatórios</strong>.
        </div>
      </div>
    );
  }

### Rota e sidebar
- Adicionar a rota em src/App.js:
  import NovaPagina from './pages/modulo/NovaPagina';
  <Route path="/modulo/nova" element={<NovaPagina />} />

- Adicionar o item no array GRUPOS em src/components/Sidebar.js:
  { path: '/modulo/nova', label: 'Nome do Item', todos: true }
  // ou: supervisor: true  (se for restrito a supervisores)

### Número de parsing (formato brasileiro)
Usar sempre esta função para ler valores do Firestore:

  function parseNum(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val ?? '').trim().replace(/\s/g, '');
    if (!str || str === '-') return 0;
    const lastComma = str.lastIndexOf(',');
    const lastDot   = str.lastIndexOf('.');
    let s = str;
    if (lastComma !== -1 && lastDot !== -1) {
      s = lastComma > lastDot
        ? str.replace(/\./g, '').replace(',', '.')
        : str.replace(/,/g, '');
    } else if (lastComma !== -1) {
      s = str.replace(',', '.');
    } else if (lastDot !== -1) {
      const after = str.substring(lastDot + 1);
      if (after.length === 3 && /^\d+$/.test(after) && /^\d/.test(str))
        s = str.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

### Formatação de datas (formato brasileiro DD/MM/AAAA)
  function parseDataBR(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  }
  function toISO(str) {
    const d = parseDataBR(str);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function toMesAno(str) {
    const d = parseDataBR(str);
    if (!d) return null;
    return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

### maxWidth da página
Sempre usar: maxWidth: 1100, margin: '0 auto'
```

---

## Como usar este prompt

1. Copie o bloco entre os três backticks acima
2. Preencha as seções marcadas com `[DESCREVA AQUI]`:
   - Nome da coleção Firebase e campos
   - Quais KPIs mostrar e suas fórmulas
   - Quais gráficos criar e suas dimensões
3. Cole no chat com Claude Code

## Checklist antes de pedir

- [ ] Sei o nome da coleção no Firestore
- [ ] Sei quais campos existem nos documentos
- [ ] Defini quais métricas aparecem nos KPIs
- [ ] Defini quais dimensões cada gráfico vai mostrar
- [ ] Sei o caminho da rota (ex: `/modulo/nova-pagina`)
- [ ] Sei se a página é para todos ou só supervisores
