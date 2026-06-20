# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Dev server on http://localhost:3000 (aponta pro Firestore real)
npm run build    # Production build to /build
npm test         # Jest in interactive watch mode

# Dev local com Firebase Emulator (não consome quota)
npm run emulators     # Inicia Firestore+Auth emulators (porta 8080/9099/UI:4000)
npm run start:dev     # Dev server apontando pro emulator
npm run seed          # Popula emulator com dados mínimos de teste
```

## Firebase Emulator (dev local)

Pra desenvolver features novas sem queimar a quota Spark (50k reads/dia) e sem
poluir os dados reais do app-nri-e0598, use o Emulator Suite.

### Setup inicial (uma vez só)
```bash
npm install     # instala firebase-tools e cross-env adicionados em devDependencies
```

### Fluxo diário
Abra dois terminais:

**Terminal 1** — emulator:
```bash
npm run emulators       # mantém os dados em ./emulator-data/ entre runs
# (alternativa: npm run emulators:fresh — começa vazio)
```

**Terminal 2** — app + seed (primeira vez):
```bash
npm run seed            # cria admin@dev.local / admin123 + empresa-dev
npm run start:dev       # app aponta pro emulator
```

Depois disso é só `npm run emulators` + `npm run start:dev` — os dados persistem.

### URLs
- App:         http://localhost:3000
- UI Emulator: http://localhost:4000 (navega/edita dados como o Console)
- Firestore:   localhost:8080
- Auth:        localhost:9099

### Como funciona
- `firebaseConfig.js` lê `process.env.REACT_APP_USE_EMULATOR`. Se `'true'`, chama
  `connectFirestoreEmulator()` e `connectAuthEmulator()`. Senão, conecta no projeto
  real. **Zero mudança no código de feature** — `getDocs`, `addDoc`, tudo igual.
- Cache persistente do IndexedDB é **desligado** no modo emulator (pra evitar
  ver dados antigos depois de editar via UI do emulator).
- Dados ficam em `./emulator-data/` (commit ou ignore via `.gitignore` à vontade).

### Importar dados de produção pro emulator
Pra testar com dataset realista (sem mexer em produção):
```bash
firebase firestore:export ./prod-snapshot --project app-nri-e0598
firebase emulators:start --import=./prod-snapshot --export-on-exit=./emulator-data
```
O export conta como reads (1 por doc), então faça uma vez só e reutilize.

### Subindo a feature pra produção
Não precisa mudar nada — só rodar `npm start` (sem o `:dev`) ou `npm run build`,
que ignoram a env var. O código continua o mesmo.

## Architecture

React SPA (Create React App) + Firebase Auth + Firestore (multi-tenant). State is React Context (`UserContext`) — no Redux, no localStorage auth.

**Auth flow:** Firebase Auth (`signInWithEmailAndPassword`). On login, `UserContext` reads `usuarios_global/{uid}` to get `empresaId`, then loads `empresas/{empresaId}`. Role levels: `admin` | `supervisor` | `supervisor-filial` | `conferente`. `admin` (Jobson) can access all admin routes.

**Multi-tenant data model:** ALL business collections are nested under `/empresas/{empresaId}/`. Never write to a flat top-level collection except: `empresas`, `usuarios_global` (admin-only global lookups).

**DB helper:** `src/utils/db.js` exports `useDb()` hook. Components call:
```js
const { col, docRef, db } = useDb();
// col('nris')         → collection(db, 'empresas', empresaId, 'nris')
// docRef('nris', id)  → doc(db, 'empresas', empresaId, 'nris', id)
// db                  → raw Firestore instance (for writeBatch only)
```

**UserContext:** `src/context/UserContext.js` — provides `{ usuario, empresa, revendasVisiveis, carregando }`. Import with `import { useUser } from '../context/UserContext'`. No prop-drilling.

**Routing:** All routes in `App.js`. Sidebar groups in `components/Sidebar.js` (`TODOS_GRUPOS` array with `moduloSlug` field). Add new routes to both files. Sidebar filters groups by `empresa.modulos`.

**User management:** Old `/usuarios` route removed. Supervisor manages empresa users at `/usuarios` (linked from Admin group for admins). Admin manages global users at `/admin/usuarios`.

**Styling:** 100% inline style objects. No CSS modules, no Tailwind. **All new pages MUST use the shared design system at `src/design/`** — see "Design System" section below. Brand colors: red `#E31837`, blue `#1D5A9E`.

**Charts:** Recharts (`ComposedChart`, `PieChart`). Always use `<ResponsiveContainer>` + the shared `TooltipBRL` component from `src/design/`.

**Excel import:** SheetJS (`xlsx`). Always use `XLSX.read(data, { type: 'array' })` — **never** `cellDates: true` (causes MM/DD date ambiguity). Parse Excel date serials manually: `new Date(Math.round((serial - 25569) * 86400 * 1000))` using UTC methods.

**Number parsing:** Brazilian format (dot = thousands, comma = decimal). Use the `num()` helper exported from `ImportarRelatorio.js` for all numeric cell parsing.

## Firestore Read Optimization — minimize quota usage

The Firestore Spark plan caps at **50k reads/day**. The app is read-heavy and easily hits this ceiling without care. **Every new page or feature MUST follow these rules.**

This section was rebuilt on 2026-05-23 after the optimization sprint that reduced daily reads by an estimated 60-80%. The rules below reflect what's actually working in production — they're not aspirational, they're battle-tested.

### Three layers of caching active in production

1. **IndexedDB Persistence (SDK level)** — `firebaseConfig.js` initializes Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED })`. The SDK serves unchanged docs from IndexedDB across sessions automatically.

2. **CatalogosContext (memory level)** — `src/context/CatalogosContext.js` caches `produtos`, `locations`, `picking_config` and `locations_mensal` (keyed by chaveMes) in React memory for the whole session. Use `useCatalogos()` instead of `getDocs(col('produtos'))`.

3. **Server-side filtering (query level)** — collections that grow (`abastecimentos`, `inventory_logs`, `vendas_relatorio`) are queried with `where('criadoEm', '>=', N months ago)` to avoid downloading historical garbage.

### MANDATORY rules for every new page/feature

#### 1. NEVER fetch `produtos`, `locations`, `picking_config`, `locations_mensal` directly.
Use `useCatalogos()`:

```js
import { useCatalogos } from '../../context/CatalogosContext';

function MinhaPagina() {
  // produtos eager (carregado quando user loga): use direto
  const { produtos, produtosMap, cxPorPltMap, locations } = useCatalogos();

  // picking_config / locations_mensal lazy: chame o loader
  const { obterPickingConfig, obterLocationsMensal } = useCatalogos();
  const pcfg = await obterPickingConfig();
  const lmensal = await obterLocationsMensal('2026-05');
}
```

**After importing/editing produtos** (e.g., `ConfiguracoesPage` after 01.11 import), call `invalidarProdutos()` so other pages reload fresh on next mount:

```js
const { invalidarProdutos } = useCatalogos();
// ... após setDoc/batch:
invalidarProdutos();
```

Same for `invalidarLocations()`, `invalidarPickingConfig()`, `invalidarLocationsMensal(chaveMes)`.

#### 2. NEVER put `col`, `docRef`, or any function from `useDb()` in a useEffect dep array.
They're recreated every render → **infinite fetch loop**. Use empty deps + `// eslint-disable-next-line react-hooks/exhaustive-deps`, or wrap in `useCallback`/`useRef`.

> The Plano de Ação loop bug (May 2026) cost 390k reads in a few hours because of this.

#### 3. Growing collections MUST be filtered by period on the server.
For `abastecimentos`, `inventory_logs`, `vendas_relatorio`, **never** do `getDocs(col('abastecimentos'))`. Always:

```js
const corte = new Date();
corte.setMonth(corte.getMonth() - 6);  // 6 months covers most use cases
const snap = await getDocs(query(
  col('abastecimentos'),
  where('criadoEm', '>=', corte.toISOString()),
  orderBy('criadoEm', 'desc'),
  limit(2000),  // safety cap
));
```

Pages already using this pattern: `DashboardIV`, `PlanificadorIV`, `RegistroAbastecimentoPage`, `ResultadoIV`. Copy the pattern when reading these collections in new pages.

#### 4. Soft-deleted logs must be filtered at read time.
`inventory_logs` uses `excluido: true` field. EVERY screen reading logs MUST apply `filtrarLogsAtivos()` from `src/modules/gerenciamento-estoque/shared/inventoryLogsFilter.js`.

#### 5. Direct doc reads are cheaper than equality queries.
Prefer `getDoc(docRef('x', 'id'))` over `getDocs(query(col, where('__name__', '==', id)))`.

#### 6. useMemo for derived data.
After fetching, all client-side filtering/sorting/aggregating should be `useMemo`-ed. Changing filters MUST NOT refetch — filter the in-memory dataset.

#### 7. Parallel fetches when independent.
`Promise.all([getDocs(a), getDocs(b)])` — never sequential awaits for independent reads.

#### 8. Bulk operations use `writeBatch` in chunks of 450.
Limit is 500; 450 leaves headroom. Same for deletes (`HistoricoImportacoes`).

#### 9. Don't add real-time listeners (`onSnapshot`) without explicit reason.
Each `onSnapshot` keeps a connection open and bills as reads whenever the data changes. For a CRUD admin app like this, manual refetch on user action is cheaper.

#### 10. When unsure, audit before shipping.
Open DevTools → Network → filter `firestore`. If you see large transfers (>1 MB) on a fresh load, something is wrong. If you see repeated identical fetches across pages, something needs caching. Then check Firebase Console → Firestore → Usage 24h after deploy to confirm.

### Pages already optimized (reference patterns)

| Pattern | Reference page |
|---|---|
| useCatalogos for produtos | `src/pages/LancarAbastecimento.js` |
| useCatalogos for produtos + locations + locations_mensal | `src/modules/gerenciamento-estoque/inventory/components/CountingForm.jsx` |
| useCatalogos + filter by period | `src/pages/DashboardIV.js` |
| Invalidação após import | `src/pages/ConfiguracoesPage.js` (chama `invalidarProdutos()` após salvar) |
| Soft delete filter | `src/modules/gerenciamento-estoque/analytics/components/AdherenceABCDashboard.jsx` |

### Local backup
`backup-firestore.js` (Node + firebase-admin) downloads every doc as JSON locally. Idempotent — rerun to resume if it fails. Requires `service-account-key.json` in project root (in `.gitignore`).

## Design System (WJS UI) — `src/design/`

**Reference implementation:** `src/pages/gestao-prejuizo/WQIPage.js` — every new page MUST match this visual language and use components from `src/design/`. Don't recreate cards, KPIs, filters, or tables from scratch.

### Module layout

```
src/design/
├── tokens.js       → const D (colors, shadows, radius, fonts) + injects global keyframes/Recharts overrides
├── utils.js        → brl(), numFmt(), intFmt() — pt-BR formatters
├── styles.js       → sLabel, sInput, sBtnClear, sBtnNav, sBtnPrimary, sSelectInline, tdStyle, cardStyle
├── components.js   → PageContainer, PageHeader, KPICardPrimary/Secondary, ChartCard, FilterBar/FilterField, Chip, Tabela, TooltipBRL, Skeleton, EmptyState, Vazio, BotaoVoltar/Nav/Clear, MiniRanking
└── index.js        → re-exports everything; import from `'../../design'`
```

### How to consume

```js
import {
  D, brl, numFmt,
  sLabel, sInput, sSelectInline, tdStyle,
  PageContainer, PageHeader, KPICardPrimary, KPICardSecondary, ChartCard,
  FilterBar, FilterField, Chip, Tabela, TooltipBRL, Skeleton, EmptyState, Vazio,
  BotaoVoltar, BotaoNav, BotaoClear, MiniRanking,
} from '../../design';
```

Importing `'../../design'` once auto-injects the global stylesheet (keyframes `wjs-shimmer`, `wjs-fadeUp`; hover states for `.wjs-chip`, `.wjs-btn-*`; Recharts outline removal).

### Design tokens — never hardcode

| Token | Value | Use for |
|---|---|---|
| `D.bg` | `#f8fafc` | Page background (zebra row alternate) |
| `D.surface` | `#ffffff` | Card / container background |
| `D.border` | `#e2e8f0` | Card borders |
| `D.borderLight` | `#f1f5f9` | Table row borders, chart gridlines |
| `D.text` | `#0f172a` | Primary text (H1, KPI values, table headers bg) |
| `D.textSec` | `#475569` | Secondary text (table cells, labels) |
| `D.textMuted` | `#94a3b8` | Tertiary (placeholders, footnotes, uppercase labels) |
| `D.red` / `D.redSoft` / `D.redBorder` | `#E31837` family | Brand accents, error, primary loss/danger |
| `D.blue` / `D.blueSoft` / `D.blueBorder` | `#1D5A9E` family | Secondary brand, info |
| `D.amber` / `D.amberSoft` / `D.amberBorder` | warning amber | Curva B, meta, warning |
| `D.green` / `D.greenSoft` / `D.greenBorder` | success green | Curva A, success, dentro-de-meta |
| `D.shadow` / `D.shadowMd` | layered shadows | Cards (shadow), tooltips/modals (shadowMd) |
| `D.radius` | `14` | Card border-radius (use `8` for buttons/inputs, `6` for inline elements) |
| `D.font` | system / Inter | All text |
| `D.mono` | JetBrains Mono | **All numbers** (KPI values, table $ values, ranks, percentages) |
| `D.transition` | `0.22s cubic-bezier` | Hover transitions on interactive elements |

### Page skeleton (copy-paste this for new pages)

```jsx
import {
  D, brl, PageContainer, PageHeader, KPICardPrimary, KPICardSecondary,
  ChartCard, FilterBar, FilterField, Tabela, TooltipBRL, EmptyState, Vazio,
  sInput, tdStyle,
} from '../../design';

export default function MinhaPaginaNova() {
  // ... state, effects ...

  return (
    <PageContainer maxWidth={1200}>
      <PageHeader
        kicker="Nome do Módulo"
        titulo="Título da Página"
        sub="optional descrição abaixo"
        acoes={<BotaoNav onClick={...}>Outra view</BotaoNav>}
      />

      <FilterBar>
        <FilterField label="Data de">
          <input type="date" style={sInput} ... />
        </FilterField>
        <FilterField label="Tipo">
          <select style={sInput} ...>...</select>
        </FilterField>
        {temFiltro && <BotaoClear onClick={limparTudo} />}
      </FilterBar>

      {/* Bento KPIs: 2 grandes + 3 secundários */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <KPICardPrimary label="..." valor={brl(x)} cor={D.red} />
        <KPICardPrimary label="..." valor={brl(y)} cor={D.green} destaque />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPICardSecondary label="..." valor={...} cor={D.blue} />
        ...
      </div>

      {!temDados ? (
        <EmptyState titulo="..." descricao="..." />
      ) : (
        <>
          <ChartCard titulo="...">
            <ResponsiveContainer ...>
              <BarChart ...>
                <CartesianGrid stroke={D.borderLight} />
                <Tooltip content={<TooltipBRL />} />
                <Bar fill={D.red} ... />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Tabela colunas={[...]} linhas={[...]} renderLinha={(l, i) => <tr ... />} />
        </>
      )}
    </PageContainer>
  );
}
```

### Do / Don't

**DO:**
- Use `D.mono` for **every number** displayed (KPI values, table $ cells, ranks)
- Use `kicker` (small uppercase label) above the H1 to indicate the module
- Use the red vertical bar (3px wide) as section delimiter inside cards
- Use `letterSpacing: -0.8` to `-1.5` for big values; `letterSpacing: 2–2.5` for uppercase labels
- Use `animation: 'wjs-fadeUp 0.3s ease both'` on the main content wrapper
- Show `Skeleton` blocks (not "Carregando…" text) during load
- Show `EmptyState` (red icon, instructions) when collection is empty in Firebase
- Show `Vazio` (small chart icon, italic message) when filtered result is empty
- Format BRL values with `brl()`, plain numbers with `numFmt()`

**DON'T:**
- Don't hardcode colors — always reference `D.red`, `D.blue`, etc.
- Don't import recharts `Tooltip` without overriding with `<TooltipBRL />` for currency
- Don't use emoji as icons in page chrome — use the inline SVG patterns (Heroicons-style strokes with `D.red` or `D.textMuted` stroke color). Emojis are fine inside business buttons (`🔄 Atualizar`, `📥 Importar`) but not in headers/empty-states/cards.
- Don't create local design tokens (`const card = { ... }`) at the bottom of pages — use `cardStyle` from `src/design/styles`
- Don't redefine `KPICard`, `Tabela`, etc. locally — import from the design system. Need a variant? Add a prop to the existing component.
- Don't put text "Carregando..." or "Sem dados" raw — use `Skeleton` or `EmptyState`/`Vazio`

### Typography rules

- **H1 (page title)**: `fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: D.text` — use `<PageHeader titulo="..." />`
- **Kicker (uppercase label)**: `fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: D.textMuted`
- **Card title**: `fontSize: 13, fontWeight: 700, letterSpacing: -0.2` — use `<ChartCard titulo="..." />`
- **KPI label**: `fontSize: 10, fontWeight: 700, letterSpacing: 2, uppercase, color: D.textMuted`
- **KPI primary value**: `fontSize: 32, fontWeight: 800, fontFamily: D.mono, letterSpacing: -1.5`
- **KPI secondary value**: `fontSize: 22, fontWeight: 800, fontFamily: D.mono, letterSpacing: -0.8`
- **Table body**: `fontSize: 12, color: D.textSec`, header `fontSize: 11, background: D.text, color: '#fff'`
- **Filter label**: same as kicker; **filter input**: `sInput` (height ~32px, radius 8)

### Recharts conventions

- Always wrap in `<ResponsiveContainer width="100%" height={...}>`
- `<CartesianGrid strokeDasharray="3 3" stroke={D.borderLight} />`
- Hide axes: `axisLine={false} tickLine={false}` (let gridlines speak)
- Tick style: `{ fontSize: 11, fill: D.textMuted, fontFamily: D.font }`
- For BRL charts, format Y-axis with `tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}`
- Bar radius: `[0, 5, 5, 0]` (horizontal) or `[5, 5, 0, 0]` (vertical, top-rounded)
- Line color: `D.red` for "real / loss", `D.blue` for "meta / reference", `strokeDasharray="6 3"` for projection/target

### Interactive elements — defaults (NÃO PRECISA PEDIR)

Toda página WJS já vem com esses comportamentos. Não espere o usuário pedir — sempre aplicar:

#### 1. Tabelas — sempre com cabeçalho ordenável

**Toda tabela criada no app DEVE ter setas de ordenação em todas as colunas.** O usuário precisa poder clicar no cabeçalho e ordenar por ordem alfabética/numérica/percentual/valor — ascendente ou descendente.

Padrão de UX:
- Seta neutra `↕` (cinza, `opacity: 0.5`) em colunas sem ordenação ativa
- Seta `▲` (vermelho `D.red`) quando ordenada ascendente
- Seta `▼` (vermelho `D.red`) quando ordenada descendente
- Click cicla: `null → asc → desc → asc → desc …`
- Trocar de coluna reseta pra `asc`
- Cabeçalho clicável ganha `cursor: pointer` + `userSelect: 'none'` + cor mais escura quando ativo
- Ordenação numérica automática quando os valores são números puros (ex: número de mapa); senão `localeCompare('pt-BR', { numeric: true })` pra ordenar texto com números embutidos corretamente

**Referência canônica:** `TabelaEFC` em `src/pages/gestao-mpd/_FasePage.js` (subcomponente local com `useState` + `useMemo`).

A tabela compartilhada `Tabela` do `src/design/components.js` também aceita esse padrão — quando criar uma tabela nova, garanta que ela tenha setas no `<thead>` desde o primeiro render.

#### 2. Gráficos — sempre clicáveis, sempre como filtro

**Todo gráfico do app DEVE ser clicável e funcionar como filtro.** Click em barra/fatia/ponto aplica filtro pelo valor daquela categoria; click de novo na mesma categoria remove o filtro (toggle).

Padrão de UX:
- `onClick={(payload) => toggle('campo', payload.valor)}` no `<Bar />`, `<Pie />`, `<Line />` etc.
- `cursor: 'pointer'` no elemento (Recharts respeita via prop)
- Cor da categoria filtrada destacada; outras opacas (`opacity: 0.35` ou similar)
- O estado de filtro vive em `useState` no componente da página (não localStorage) e dispara re-filter de todos os outros gráficos + tabela de detalhamento via `useMemo`
- `<Chip>` aparece na `FilterBar` mostrando o filtro ativo, com botão `×` pra limpar
- Múltiplos gráficos no mesmo módulo são todos cruzáveis — clicar em "Motorista X" filtra também os gráficos de "Placa", "Mapa", "Cliente" etc.

**Referências canônicas:**
- `ReposicaoPage.js` — múltiplos gráficos cruzáveis (Motivo, Produto, Motorista, Ajudante, Placa, RN, Cliente)
- `_FasePage.js` (MPD) — `toggle('motorista' | 'placa' | 'data', valor)` cascateando em todos os componentes

Mesmo gráficos "informativos" (KPIs visuais, evolução mês a mês) devem ser clicáveis quando faz sentido filtrar pelo período/categoria daquele ponto. Se sinceramente não faz sentido (ex: gauge único), documente o motivo num comentário inline.

#### 3. Filtros — sempre multi-select com Ctrl/Cmd+click

**Todo filtro do app DEVE suportar seleção múltipla via Ctrl/Cmd+click.** Vale tanto pra cliques em gráficos quanto pra opções de lista suspensa (dropdown).

Padrão de UX:
- **Click normal** → substitui pelo valor único (toggle: re-click no mesmo valor limpa)
- **Ctrl/Cmd+click** → adiciona/remove sem afetar os outros valores selecionados
- Estado guardado sempre como `string[] | null` (array de valores ou vazio). Aceitar string-única só pra back-compat de chamadas antigas
- Uma `<Chip>` por valor selecionado na FilterBar, cada uma com seu próprio botão `×` pra remover só aquele
- Em dropdowns: dica "Segure Ctrl pra selecionar múltiplos" no topo da lista; opções selecionadas com ✓ visível

**Helpers canônicos** (em `src/pages/gestao-mpd/_FasePage.js` — promover pra `src/design/utils.js` quando outro módulo precisar):
```js
asLista(v)                          // normaliza string | array | null → array
toggleMulti(atual, valor, event)    // produz novo estado respeitando ctrl/meta key
```

Lógica de filtro:
```js
const lista = asLista(filtros.campo);
if (lista.length > 0 && !lista.includes(l.campo)) return false;
```

Handler de gráfico (passa o event):
```js
onClick={(payload, e) => toggle('campo', payload.valor, e)}
```

**Dropdown nativo `<select>` NÃO suporta Ctrl+click sem virar listbox feia.** Em vez de usar `<select multiple>`, use o componente `MultiSelectDropdown` (custom com checkboxes + Ctrl+click) — implementação de referência em `_FasePage.js`.

**Referência canônica:** `_FasePage.js` (MPD) — filtros `frota` (dropdown), `placa`, `motorista`, `data` (cross-filter via gráfico) — todos multi-aware desde 2026-05-27.

### Multi-page modules

When a module has multiple pages (like `gestao-prejuizo/` with WQI, Troca, Reposição, Cadastros), keep them consistent:
- Same `kicker` value (e.g., all four pages use `kicker="Gestão de Prejuízo"`)
- Same `maxWidth` on `PageContainer` (1100 or 1200, pick one per module)
- Sub-pages use `<BotaoVoltar onClick={...} />` at the top + a context-specific kicker (e.g., `kicker="WQI"` instead of `kicker="Gestão de Prejuízo"` on the sub-page)

## Firebase Collections

| Collection | Purpose |
|---|---|
| `nris` | Receipt documents. Each has `produtos[]` array with `codProduto`, `qtdPlt`, `qtdCx`, `validade`, `cxPorPlt`, `curva` |
| `usuarios` | App users: `{ nome, senha, nivel }` |
| `produtos` | Product catalog: `{ codigo, nome, cxPorPlt, curva }` |
| `motoristas` / `cavalos` / `carretas` / `origens` | Lookup lists: `{ valor }` |
| `curva_abc_mensal` | Monthly ABC data keyed by `YYYY-MM`. Each doc has `produtos[]` with `cxTotal`, `cxAberto`, `cxFechado`, `diasComVendas` |
| `curva_abc_meta` / `indices` | Sorted list of available month keys |
| `curva_abc` | Current ABC classification used by the NRI module: `{ codigo, curva }` |
| `produtos_fatores` | From relatório 01.11: `{ codigo, fatorHL, fatorPalete }`. Doc ID = product code |
| `picking_config` | Products configured for picking: `{ codProduto, nomeProduto, espacosPalete, cxPorPlt }` |
| `abastecimentos` | Reabastecimento/Ressuprimento logs: `{ codProduto, nomeProduto, tipo, qtdPaletes, dataOperacional, hora, conferente, criadoEm }` |
| `vendas_relatorio` | Imported sales reports: `{ importadoEm, nomeArquivo, produtos[], datas[] }`. `produtos[]` has `{ codigo, descricao, vendas: { 'DD/MM/AAAA': qtd } }` |
| `locations` | Warehouse locations: `{ area, rua, posicao, assignedSkuId }` |
| `inventory_logs` | Counting records with `{ assignedLocation, productCurva }` snapshots saved at write time |
| `relatorio_030237` | Imported 03.02.37 reports: `{ importadoEm, nomeArquivo, totalLinhas, linhas[] }`. `linhas[]` has `{ operacao, vendedor, motorista, dataOperacao, emissao, nota, status, cliente, nome, produto, unidade, descricao, qtde, valor, mapa, origemPedido, pesoBrutoMapa }` |

Bulk deletes always use `writeBatch` in chunks of 450 (Firestore limit is 500).

## Reabastecimento / Ressuprimento Module

Routes under `/reab/`. Pages in `src/pages/`.

| Page | Route | Level | Purpose |
|---|---|---|---|
| `DashboardIV` | `/reab/dashboard` | All | KPI summary + bar chart + sortable table |
| `PlanificadorIV` | `/reab/planificador` | All | Month pivot: all products × all days, Plan/Real/GAP |
| `VendasPage` | `/reab/vendas` | All | Pivot table of imported sales reports with search |
| `LancarAbastecimento` | `/reab/lancar` | All | Daily reab/ressp entry form |
| `RegistroAbastecimentoPage` | `/reab/registro` | All (edit: Supervisor) | Full log with inline date edit + CSV bulk import |
| `ConfigPicking` | `/reab/config` | Supervisor | Manage picking_config: add/edit/delete/import CSV |
| `ImportarVendasPage` | `/reab/importar-vendas` | Supervisor | Import relatório 03.02.36.08 (Excel) |

### Business Rules — IV (Índice de Vendas)

**Reabastecimento** — happens in the morning after delivery (D+1 relative to sales):
- `dataOperacional` = day the restock physically happened
- Sales reference = `dataOperacional - 1 day` (the system subtracts 1 day automatically)
- Expected pallets = `vendas[dataRef] / cxPorPlt`
- Status: ✅ ±20% of expected · ⚠️ >20% above · ⬇️ <80% of expected

**Ressuprimento** — emergency restock at night (22:00–06:59), always a failure:
- `dataOperacional` uses `diaOperacional()` rule: if `hora < 07:00`, use previous calendar day
- Sales reference = `dataOperacional` itself (same day, D+0)
- Any ressuprimento = 🚨 (operational failure — picking ran out)

**Planificador IV — Planejado per day:**
- Sunday → `—` (no operation)
- Monday → sales of **Saturday** (skip Sunday, D-2)
- Tuesday–Saturday → sales of previous day (D-1)
- Future date → `0`
- Reference date missing from vendas_relatorio → `—` (data absent, not zero sales)

**`diaOperacional()` rule (used in LancarAbastecimento):**
```js
if (agora.getHours() < 7) agora.setDate(agora.getDate() - 1);
return formatarData(agora); // DD/MM/AAAA
```

### Relatório 03.02.36.08 — Import (ImportarVendasPage)

Columns: A=Date · B=Código · C=Descrição · D=Qtd Caixas/dia · E=Palete Fechado flag ("Sim"=ignore / "Não"=include) · F=HL

**Date parsing (`parsearData`):** The report exports dates as text strings in `MM/DD/AAAA` (American) format, **not** DD/MM. Disambiguation rule:
- If part1 > 12 → DD/MM (day is unambiguous)
- If part2 > 12 → MM/DD (day is unambiguous)
- Both ≤ 12 (ambiguous) → treat as **MM/DD** (this report's format)
- Excel serial numbers → `Math.floor((serial - 25569) * 86400 * 1000)` with UTC getters

Only products present in `picking_config` are kept. All others are discarded.
`vendas_relatorio` docs are merged in PlanificadorIV (all imports, later wins per date/product).

### ConfigPicking — CSV Import Format

```
Codigo ; Nome ; Espaços Palete
```
Separator = semicolon. First row = header. `cxPorPlt` is pulled automatically from `produtos` collection.

### RegistroAbastecimentoPage — CSV Bulk Import Format

```
Codigo ; Tipo ; QtdPaletes ; DataOperacional
```
`Tipo` must be `reabastecimento` or `ressuprimento`. `DataOperacional` = DD/MM/AAAA.
- **Ressuprimento**: DataOperacional = day whose sales it covers (D+0)
- **Reabastecimento**: DataOperacional = day the restock happened (dashboard auto-applies D-1 for sales ref)

### Sidebar — Collapse Behavior

`Sidebar.js` uses `fixado` (boolean, persisted to `localStorage('sidebar-fixado')`) and `hovering` state:
- `expandido = fixado || hovering` → width 240px or 56px
- Groups collapsed by default; only the active route's group opens on mount
- Pin button (📌 red=fixed, 📍 gray=unfixed) in header

## Curva ABC Module

Located in `src/pages/curva-abc/`.

**`ImportarRelatorio.js`** exports:
- `num(val)` — BR number parser (e.g. `"3.456,78"` → `3456.78`, `"58.936"` → `58936`)
- `numHL(val)` — like `num()` but never treats a lone dot as thousands separator
- `calcularABC(produtos, campo)` — Pareto ranking; returns array with `_rank`, `_curva` (A≤80%, B≤95%, C>95%), `_percAcumulado`

**Relatório 03.02.36.08 columns:** A=Date · B=Código · C=Descrição · D=Qtd Caixas/dia · E=Palete Fechado flag (>0 = closed pallet → Estoque) · F=HL

**Relatório 01.11 columns:** A=Código · B=Fator HL · C=Fator Palete (caixas/palete). Header on row 1. Stored in `produtos_fatores`.

**`DashboardCurvaABC.js`** parameters:
- **Caixas (`cx`)**: raw `cxTotal / cxAberto / cxFechado` from monthly data
- **Paletes (`plt`)**: same cx fields ÷ `fatorPalete` from `produtos_fatores`. Button is disabled until 01.11 is imported. Products with no `fatorPalete` are excluded from the ranking.
- **Visão Armazém/Picking/Estoque** maps to `cxTotal / cxAberto / cxFechado` respectively.

## Gerenciamento de Estoque (WMS) Module

Located in `src/modules/gerenciamento-estoque/` and integrated into `src/pages/gerenciamento-estoque/`.

**Three sub-modules:**
1. **Inventory** (`inventory/`) — Counting registration with validation
2. **Layout** (`layout/`) — Location (endereco) management
3. **Analytics** (`analytics/`) — Adherence metrics and warehouse health

### Pages

| Page | Route | Level | Purpose |
|---|---|---|---|
| `CountingPage` | `/estoque/contar` | All | Register inventory counts with SKU/location validation |
| `LocationManagementPage` | `/estoque/localizacoes` | Supervisor | Create/edit warehouse locations |
| `DashboardPage` | `/estoque/dashboard` | All | View adherence metrics and expiry alerts |

### Firebase Collections Used by WMS

| Collection | Purpose |
|---|---|
| `locations` | Warehouse locations with hierarchy Area > Street > Position and assigned SKU |
| `inventory_logs` | Each counting record with validation scores and expiry tracking |

### Key Services

**Validation (`validationService.js`):**
- `validateProductMatch(product, location)` — SKU in location matches scanned product?
- `validateLayoutAdherence(product, location)` — Curva A in EstoqueA, B in EstoqueB, etc.? (Picking/AG/Marketplace are transitional, no penalty)
- `calculateABCAdherence(isLayoutAdherent)` — Returns 0 or 100
- `validateCountingInput(input)` — Full input validation

**Expiry (`expiryService.js`):**
- `calculateDaysUntilExpiry(expiryDate)` — Positive = expires in N days, negative = expired
- `isCriticalDate(daysUntilExpiry, threshold)` — Within 30-day threshold?
- `isExpired(daysUntilExpiry)` — Already expired?
- `checkExpiryAlert(daysUntilExpiry, threshold)` — Generate alert if needed
- `sortByExpiryUrgency(items)` — Order: expired → critical → ok

**Counting (`countingService.js`):**
- `registerCounting(input, fetchProduct, fetchLocation, saveLog)` — Orchestrates validation → calculation → Firebase save. Uses dependency injection for testability.
- `getSuccessMessage(result)` — User-friendly result message
- `getNextActions(result)` — Suggested next steps for conferente
- `getCountingSummary(result)` — Summary with error/warning counts

**Analytics (`analyticsService.js`):**
- `calculateAdherenceMetrics(logs, startDate, endDate)` — Full aggregation (total, by-area, by-curve, expiry alerts)
- `calculateAdherenceTrend(current, previous)` — Compare periods, return trend direction
- `identifyLowPerformingAreas(metrics, topN)` — Worst-performing areas
- `calculateWarehouseHealthScore(metrics)` — 0-100 score (50% ABC adherence, 30% no expired, 20% no critical)
- `generateRecommendations(metrics)` — Actionable suggestions
- `exportMetricsToCSV(metrics)` — Full report as CSV

### Common WMS Patterns

**Location Address Format:**
```js
"EstoqueA > Rua 01 > Pos. 001"
// Used in InventoryLog.locationAddress for audit trail
```

**Adherence Rules:**
```
- Curva A products MUST be in EstoqueA → 100% adherence if yes, 0% if no
- Curva B products MUST be in EstoqueB → 100% adherence if yes, 0% if no
- Curva C products MUST be in EstoqueC → 100% adherence if yes, 0% if no
- Picking/AG/Marketplace are transitional → always 100% (no penalty)
```

**Expiry Thresholds:**
```js
const CRITICAL_THRESHOLD_DAYS = 30;  // Days before expiry to flag critical
const PRE_BLOQUEIO_DAYS = 45;        // For NRI labels (validade - 45)
const BLOQUEIO_DAYS = 30;            // For NRI labels (validade - 30)
```

**AlertWidget Component:**
Reusable alert display in `shared/AlertWidget.jsx`. Props:
- `alerts` — array of `{ type, message, severity, suggestedActions }`
- `mode` — `'compact'` (inline badges) or `'full'` (expandable cards)
- Colors: error (#fee2e2), warning (#fef3c7), info (#dbeafe)

## Gestão MPD Module

Located in `src/pages/gestao-mpd/`. Pages: **EFC**, **EFD**, **TI**, **Histograma**, **Metas**, **Importar**.

Relatório fonte principal: **03.11.20** (mapas de carregamento) + **01.20.01.47** (cadastro de motoristas).

### Business rules — EFC (Eficiência de Carregamento)

Um mapa é **EFC OK** quando o carregamento (`fase = "Carregado"`) acontece antes da meta de horário-limite na noite anterior à entrega:

- `dataOperacao < dataEmissao` → **OK automático** (carregou na véspera)
- `dataOperacao > dataEmissao` → **NOK automático** (carregou no dia seguinte)
- `dataOperacao = dataEmissao` → **OK se** `horaOperacao ≤ metaHorario`

### EFC tem 2 metas por tipo de frota

Desde 2026-05-27, EFC opera com **duas metas separadas** (em `metas_mpd.horarios`):
- **`"EFC FF"`** → Frotas **Padronizadas** (frota própria/contrato fixo). Identificadas pela coluna `Frota Cadastro` começando com `"padroniz"` (case-insensitive — cobre "Padronizada", "Padronizado", "Padronizadas").
- **`"EFC Spot"`** → demais frotas (terceirizadas/avulsas). Identificadas como **qualquer outro valor** (incluindo vazio/null).

Cada linha do relatório 03.11.20 é classificada individualmente via `isFrotaPadronizada(linha)` no `_FasePage.js`, e o cálculo de EFC usa a meta correspondente. Os gráficos consolidados (Mês a Mês, Por Dia) somam mapas FF e Spot em um único %, porque cada um já foi classificado linha-a-linha antes de entrar no agregado.

**Back-compat:** o `MetasMPD.js` e o `_FasePage.js` reconhecem a chave antiga `"EFC"` no Firestore como sinônimo de `"EFC FF"`. Isso preserva metas cadastradas antes da divisão. Quando o supervisor abre `/gestao-mpd/metas` e salva, a chave `"EFC"` antiga é descartada e fica só `"EFC FF" + "EFC Spot"`.

**EFD e TI continuam com 1 meta única** (sem split de frota).

### Convenção de meta "não cadastrada"

`metaHorario === "00:00"` (default no `PADRAO_HORARIO` do MetasMPD) é tratado como **"não cadastrada"** pelo helper `metaValida()`. Sem isso, qualquer hora positiva caía em NOK indevido. Em todos os pontos que consomem meta, use `metaValida(metaStr)` em vez de checar `!= null` direto.

## Key Patterns

**Language:** 100% JavaScript (no TypeScript). All imports/exports use `.js` extension. No build-time type compilation — types are documented in JSDoc or `SERVICES.md` / `README.md` files.

**Firebase batch delete:**
```js
async function limparColecao(nomeColecao) {
  const snap = await getDocs(collection(db, nomeColecao));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
```

**Dependency injection pattern (WMS services):**
```js
// Services accept fetch/save functions as parameters for testability
async function registerCounting(input, fetchProduct, fetchLocation, saveLog) {
  const product = await fetchProduct(input.productId);
  const location = await fetchLocation(input.locationId);
  // ... validation ...
  const logId = await saveLog(inventoryLog);
  return result;
}

// Called with Firebase operations:
const result = await registerCounting(input,
  (id) => getDoc(doc(db, 'produtos', id)).then(s => s.data()),
  (id) => getDoc(doc(db, 'locations', id)).then(s => s.data()),
  (log) => addDoc(collection(db, 'inventory_logs'), log)
);
```

**Month key format:** `YYYY-MM` (e.g. `"2026-01"`). Helper: `monthKey(ano, mes)`.

**Date format throughout the app:** `DD/MM/AAAA` (Brazilian). NRI labels and all UI display use this format.

**Qtde TT formula (NRI label):** `(qtdPlt × cxPorPlt) + qtdCx`

**Label PDF:** Generated client-side as HTML printed to A4. **2 labels per sheet**, and each full pallet emits **2 duplicate sheets** (so 4 labels per palete físico). Leftover boxes (non-pallet) get 1 sheet only. Pre-bloqueio = validade − 45 days; Bloqueio = validade − 30 days.

**WMS Module Imports:**
```js
// Always use relative paths, never @/ aliases
import { CountingForm } from '../../modules/gerenciamento-estoque/inventory/components/CountingForm';
import { registerCounting } from '../../modules/gerenciamento-estoque/inventory/services/countingService';
import { AlertWidget } from '../../modules/gerenciamento-estoque/shared/AlertWidget';
```
