# Fase 2: Serviços de Validação e Lógica de Negócio

## 📁 Arquitetura de Serviços

```
src/modules/gerenciamento-estoque/
├── inventory/services/
│   ├── validationService.ts      # Regras de SKU, Layout, ABC
│   ├── expiryService.ts          # Cálculos de validade
│   ├── countingService.ts        # Orquestra tudo + salva Firebase
│   └── index.ts                  # Exportações
├── analytics/services/
│   ├── analyticsService.ts       # Agregações para dashboard
│   └── index.ts                  # Exportações
└── SERVICES.md                   # Este arquivo
```

---

## 🔧 Serviço 1: validationService.ts

Implementa as **regras de negócio** de validação.

### Funções Principais

#### `validateProductMatch(product, location): boolean`
Verifica se o SKU do produto corresponde ao SKU vinculado na localização.

```typescript
const match = validateProductMatch(product, location);
// true se product.sku === location.assignedSkuId
// false caso contrário
```

#### `checkProductMatchAlert(product, location): CountingAlert | null`
Gera alerta se há divergência de SKU.

```typescript
const alert = checkProductMatchAlert(product, location);
if (alert) {
  // { type: 'PRODUCT_MISMATCH', message: '❌ Produto não cadastrado...', actions: [...] }
}
```

#### `validateLayoutAdherence(product, location): boolean`
Verifica aderência ABC × Layout.

```typescript
const isCorrectArea = validateLayoutAdherence(product, location);
// true se Curva A em EstoqueA, Curva B em EstoqueB, etc.
// true se em Picking/AG/Marketplace (transitório, sem penalidade)
// false se Curva A em EstoqueB, etc.
```

#### `calculateABCAdherence(isLayoutAdherent): 0 | 100`
Converte boolean em score de aderência.

```typescript
const score = calculateABCAdherence(true);  // 100
const score = calculateABCAdherence(false); // 0
```

#### `validateCountingInput(input): ValidationError[]`
Valida integridade dos dados de entrada.

```typescript
const errors = validateCountingInput({
  productId: 'prod_123',
  locationId: 'loc_456',
  countedQuantity: 40,
  expiryDate: new Date('2025-12-31'),
  conferente: 'João Silva',
});
// Retorna array de erros (vazio se OK)
```

---

## ⏰ Serviço 2: expiryService.ts

Calcula **status de validade** e gera alertas.

### Funções Principais

#### `calculateDaysUntilExpiry(expiryDate, referenceDate): number`
Calcula dias até vencimento.

```typescript
const days = calculateDaysUntilExpiry(new Date('2025-12-31'));
// 255 (vence em 255 dias)
// -36 (venceu 36 dias atrás)
```

#### `isCriticalDate(daysUntilExpiry, threshold): boolean`
Verifica se está em período crítico (padrão: 30 dias).

```typescript
const critical = isCriticalDate(25, 30); // true (vence em 25 dias)
const critical = isCriticalDate(35, 30); // false (vence em 35 dias)
```

#### `isExpired(daysUntilExpiry): boolean`
Verifica se venceu.

```typescript
const expired = isExpired(-5);  // true (venceu)
const expired = isExpired(10);  // false (vence em 10 dias)
```

#### `getExpiryStatus(daysUntilExpiry, threshold): 'ok' | 'critical' | 'expired'`
Resume status em uma enum.

```typescript
const status = getExpiryStatus(25, 30);
// 'critical'
```

#### `checkExpiryAlert(daysUntilExpiry, threshold): CountingAlert | null`
Gera alerta de validade.

```typescript
const alert = checkExpiryAlert(25, 30);
if (alert) {
  // { type: 'EXPIRY_CRITICAL', message: '🔴 Vence em 25 dias...', actions: [...] }
}
```

#### `sortByExpiryUrgency(items, threshold): T[]`
Ordena itens por urgência de vencimento.

```typescript
const sorted = sortByExpiryUrgency(inventoryLogs);
// Retorna: [vencidos, críticos, OK]
```

---

## 📝 Serviço 3: countingService.ts

**Orquestra tudo**: valida, calcula, salva e retorna resultado.

### Função Principal

#### `registerCounting(input, fetchProduct, fetchLocation, saveInventoryLog): CountingResult`

Fluxo completo de registrar uma contagem.

```typescript
const result = await registerCounting(
  {
    productId: 'prod_123',
    productSku: 'SKU_20150',
    locationId: 'loc_456',
    countedQuantity: 40,
    expiryDate: new Date('2025-12-31'),
    conferente: 'João Silva',
    batchNumber: 'LOTE_2024_001',
    notes: 'Palete completa',
  },
  async (id) => {
    // Buscar produto do Firebase
    const snap = await getDoc(doc(db, 'produtos', id));
    return snap.data() as Product;
  },
  async (id) => {
    // Buscar localização do Firebase
    const snap = await getDoc(doc(db, 'locations', id));
    return snap.data() as Location;
  },
  async (log) => {
    // Salvar no Firebase
    const ref = await addDoc(collection(db, 'inventory_logs'), log);
    return ref.id;
  },
);

// Resultado:
// {
//   success: true,
//   inventoryLogId: 'log_xyz',
//   alerts: [
//     { type: 'EXPIRY_CRITICAL', message: '🔴 Vence em 25 dias', ... }
//   ],
//   adherenceSummary: {
//     locationAdherent: true,
//     abcAdherent: true,
//     expiryStatus: 'critical'
//   }
// }
```

### Funções Auxiliares

#### `getSuccessMessage(result): string`
Mensagem amigável ao usuário.

```typescript
const msg = getSuccessMessage(result);
// "✅ Contagem registrada com sucesso"
// ou "⚠️ Contagem registrada com 1 aviso(s)"
```

#### `getNextActions(result): string[]`
Próximas ações para o conferente.

```typescript
const actions = getNextActions(result);
// ['Priorizar saída', 'Próximo endereço']
```

#### `getCountingSummary(result)`
Estatísticas rápidas.

```typescript
const summary = getCountingSummary(result);
// {
//   isValid: true,
//   errorCount: 0,
//   warningCount: 1,
//   alertCount: 1,
//   adherenceScore: 100,
//   status: 'warning'
// }
```

---

## 📊 Serviço 4: analyticsService.ts

Calcula **métricas agregadas** para o dashboard.

### Funções Principais

#### `calculateAdherenceMetrics(logs, periodStart, periodEnd): AdherenceMetrics`
Calcula todas as métricas de aderência.

```typescript
const metrics = calculateAdherenceMetrics(
  inventoryLogs,
  new Date('2025-04-01'),
  new Date('2025-04-30'),
);

// Retorna:
// {
//   totalCountings: 250,
//   totalAdherent: 240,
//   adherencePercentage: 96,
//   byArea: {
//     EstoqueA: { total: 100, adherent: 100, percentage: 100 },
//     EstoqueB: { total: 100, adherent: 90, percentage: 90 },
//     EstoqueC: { total: 50, adherent: 50, percentage: 100 },
//     ...
//   },
//   byCurve: {
//     A: { total: 100, adherent: 100, percentage: 100 },
//     B: { total: 100, adherent: 90, percentage: 90 },
//     C: { total: 50, adherent: 50, percentage: 100 },
//   },
//   expiryAlerts: { critical: 5, expired: 2 }
// }
```

#### `calculateAdherenceTrend(current, previous)`
Calcula tendência entre períodos.

```typescript
const trend = calculateAdherenceTrend(metricsAbrile, metricsMarch);
// {
//   current: 96,
//   previous: 92,
//   change: 4,
//   changePercent: 4.35,
//   trend: 'improving',
//   message: '📈 Aderência melhorou 4% (4.35% de crescimento)'
// }
```

#### `identifyLowPerformingAreas(metrics, topN): Array`
Lista áreas com pior desempenho.

```typescript
const lowAreas = identifyLowPerformingAreas(metrics, 3);
// [
//   { area: 'EstoqueC', percentage: 85, total: 50, adherent: 42, nonAdherent: 8 },
//   { area: 'EstoqueB', percentage: 90, total: 100, adherent: 90, nonAdherent: 10 },
//   { area: 'Picking', percentage: 92, total: 60, adherent: 55, nonAdherent: 5 },
// ]
```

#### `calculateWarehouseHealthScore(metrics, totalLogs): number`
Calcula score de saúde geral (0-100).

Fórmula:
- Aderência ABC: 50%
- Sem vencidos: 30%
- Sem críticos: 20%

```typescript
const score = calculateWarehouseHealthScore(metrics);
// 92 (score de 0-100)
```

#### `generateRecommendations(metrics): string[]`
Gera recomendações automaticamente.

```typescript
const recs = generateRecommendations(metrics);
// [
//   '⚠️ Aderência baixa (75%). Áreas críticas: EstoqueC, Picking',
//   '🚫 2 produto(s) vencido(s) — Segregar imediatamente',
//   '🔴 5 produto(s) em data crítica — Priorizar saída',
// ]
```

#### `exportMetricsToCSV(metrics): string`
Exporta relatório em CSV.

```typescript
const csv = exportMetricsToCSV(metrics);
// "Relatório de Aderência de Estoque\n..."
// Salvar em arquivo .csv
```

---

## 🔗 Como Usar: Exemplo Completo

### 1. Registrar uma Contagem (Confente)

```typescript
import {
  registerCounting,
  getSuccessMessage,
  getNextActions,
} from '@/modules/gerenciamento-estoque/inventory/services';
import { db } from '@/firebaseConfig';
import { getDoc, addDoc, doc, collection } from 'firebase/firestore';

async function handleCounting(input: CountingInput) {
  try {
    const result = await registerCounting(
      input,
      async (id) => {
        const snap = await getDoc(doc(db, 'produtos', id));
        return snap.exists() ? (snap.data() as Product) : null;
      },
      async (id) => {
        const snap = await getDoc(doc(db, 'locations', id));
        return snap.exists() ? (snap.data() as Location) : null;
      },
      async (log) => {
        const ref = await addDoc(collection(db, 'inventory_logs'), {
          ...log,
          createdAt: new Date(),
        });
        return ref.id;
      },
    );

    // Exibir resultado
    alert(getSuccessMessage(result));

    // Próximas ações
    const actions = getNextActions(result);
    console.log('Próximas ações:', actions);

    // Se há alertas, mostrar
    if (result.alerts.length > 0) {
      result.alerts.forEach((alert) => {
        showAlert({
          title: alert.message,
          type: alert.severity,
          actions: alert.suggestedActions,
        });
      });
    }
  } catch (error) {
    if (error instanceof CountingValidationError) {
      // Mostrar erros de validação
      error.errors.forEach((err) => {
        console.error(`${err.field}: ${err.message}`);
      });
    }
  }
}
```

### 2. Exibir Métricas no Dashboard

```typescript
import {
  calculateAdherenceMetrics,
  calculateAdherenceTrend,
  identifyLowPerformingAreas,
  calculateWarehouseHealthScore,
  generateRecommendations,
} from '@/modules/gerenciamento-estoque/analytics/services';

async function loadDashboard() {
  // Buscar logs do período
  const logs = await fetchInventoryLogs(startDate, endDate);

  // Calcular métricas
  const metrics = calculateAdherenceMetrics(logs, startDate, endDate);

  // Comparar com período anterior
  const prevLogs = await fetchInventoryLogs(prevStart, prevEnd);
  const prevMetrics = calculateAdherenceMetrics(prevLogs, prevStart, prevEnd);
  const trend = calculateAdherenceTrend(metrics, prevMetrics);

  // Áreas com pior desempenho
  const lowAreas = identifyLowPerformingAreas(metrics, 3);

  // Score de saúde
  const healthScore = calculateWarehouseHealthScore(metrics);

  // Recomendações
  const recommendations = generateRecommendations(metrics);

  // Renderizar no dashboard
  render({
    adherencePercent: metrics.adherencePercentage,
    trend,
    lowAreas,
    healthScore,
    recommendations,
    byArea: metrics.byArea,
    byCurve: metrics.byCurve,
    expiryAlerts: metrics.expiryAlerts,
  });
}
```

---

## ⚠️ Tratamento de Erros

Todos os serviços levantam `CountingValidationError` com lista de erros:

```typescript
try {
  await registerCounting(...);
} catch (error) {
  if (error instanceof CountingValidationError) {
    // error.errors → Array de ValidationError
    // error.suggestions → Array de sugestões
    error.errors.forEach((e) => {
      console.error(`${e.field}: ${e.message}`);
    });
  }
}
```

---

## 📋 Próxima Fase: Componentes UI (Fase 3)

Com os serviços prontos, próximo passo é criar os componentes React:

- `LocationForm.tsx` — Cadastro de endereço
- `CountingForm.tsx` — Registrar contagem
- `AlertWidget.tsx` — Exibir alertas
- `AdherenceDashboard.tsx` — Gráficos de aderência
- `HealthScoreCard.tsx` — Score de saúde
- `ExpiryAlertsList.tsx` — Lista de produtos vencendo

Cada componente usará os serviços aqui definidos para implementar a lógica.

---

**Fase 2 ✅ Concluída!** Próximo: Fase 3 (Componentes UI).
