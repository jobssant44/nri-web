# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Dev server on http://localhost:3000
npm run build    # Production build to /build
npm test         # Jest in interactive watch mode
```

## Architecture

React SPA (Create React App) with direct Firebase Firestore integration. No Redux, no Context API — state is local `useState` per component plus `localStorage` for the session.

**Auth flow:** `App.js` reads `nri-usuario` from `localStorage`. Login checks hardcoded admin (`Jobson / 3573`) then falls back to the `usuarios` Firestore collection. Role is either `supervisor` or `conferente`. Supervisor-only routes redirect to `/` for conferentes.

**Routing:** All routes are defined in `App.js` with `react-router-dom`. The sidebar groups are declared in `components/Sidebar.js` (`GRUPOS` array) — add new routes there to make them appear in navigation.

**Styling:** 100% inline style objects. No CSS modules, no Tailwind. Shared style constants are declared at the bottom of each file (e.g., `const card`, `const td`). Brand colors: red `#E31837`, blue `#1D5A9E`.

**Charts:** Recharts (`ComposedChart`, `PieChart`). Always use `<ResponsiveContainer>`.

**Excel import:** SheetJS (`xlsx`). Always use `XLSX.read(data, { type: 'array' })` — **never** `cellDates: true` (causes MM/DD date ambiguity). Parse Excel date serials manually: `new Date(Math.round((serial - 25569) * 86400 * 1000))` using UTC methods.

**Number parsing:** Brazilian format (dot = thousands, comma = decimal). Use the `num()` helper exported from `ImportarRelatorio.js` for all numeric cell parsing.

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

**Label PDF:** Generated client-side as HTML printed to A4. 3 labels per sheet. Pre-bloqueio = validade − 45 days; Bloqueio = validade − 30 days.

**WMS Module Imports:**
```js
// Always use relative paths, never @/ aliases
import { CountingForm } from '../../modules/gerenciamento-estoque/inventory/components/CountingForm';
import { registerCounting } from '../../modules/gerenciamento-estoque/inventory/services/countingService';
import { AlertWidget } from '../../modules/gerenciamento-estoque/shared/AlertWidget';
```
