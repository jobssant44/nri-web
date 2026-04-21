# Módulo: Gerenciamento de Estoque (WMS)

## 📋 Visão Geral

Sistema de Warehouse Management (WMS) especializado em:
- **Endereçamento rigoroso** com hierarquia Area > Rua > Posição
- **Validação de Curva ABC** com mapeamento Layout × Produto
- **Gestão de Validade** com alertas críticos
- **Contagem e Aderência** com rastreamento completo

## 🏗️ Estrutura de Diretórios

```
src/modules/gerenciamento-estoque/
├── layout/              # Cadastro de áreas, ruas e posições
│   ├── components/      # UI para cadastro de localização
│   ├── services/        # Lógica de CRUD de localização
│   └── pages/           # Página principal de layout
├── inventory/           # Contagem e validação
│   ├── components/      # UI para contagem
│   ├── services/        # Lógica de contagem e validação
│   └── pages/           # Página de contagem
├── analytics/           # Dashboard de aderência
│   ├── components/      # UI para gráficos
│   ├── services/        # Cálculo de métricas
│   └── pages/           # Dashboard
└── README.md            # Este arquivo

src/database/models/
├── types.ts             # Interfaces TypeScript
├── constants.ts         # Enums e constantes
├── schema.prisma        # Schema SQL (referência)
└── index.ts             # Exportação centralizada
```

## 📊 Modelos de Dados

### 1. **Product** (Produto)

Dados mestres do produto vinculados à Curva ABC.

```typescript
interface Product {
  id: string;                   // UUID
  sku: string;                  // Código único (SKU)
  name: string;                 // Nome do produto
  curve: 'A' | 'B' | 'C';      // Classificação Pareto
  criticalDaysThreshold: 30;    // Alertar N dias antes de vencer
  cxPorPalete: 20;              // Caixas por palete
  fatorHL?: 2.5;                // Hectolitros (opcional)
}
```

**Firebase Collection:** `produtos`  
**Firestore Path:** `/produtos/{id}`

### 2. **Location** (Endereço)

Hierarquia rigorosa de localização com vínculo obrigatório a um SKU.

```typescript
interface Location {
  id: string;
  areaName: 'EstoqueA' | 'EstoqueB' | 'EstoqueC' | 'Picking' | 'AG' | 'Marketplace';
  street: '01' | '02' | ...;                   // Rua/Corredor
  palettePosition: '001' | '002' | ...;        // Posição de palete

  // Vínculo obrigatório
  assignedSkuId: string;        // SKU que DEVE estar aqui
  assignedProductId: string;    // Product.id (referência rápida)

  // Metadados
  isActive: boolean;
  capacity: 2;                  // Máximo de paletes
  currentQuantity: 1;           // Paletes atualmente lá
  lastCountedAt: Date;
}
```

**Firebase Collection:** `locations` ou `enderecos`  
**Firestore Path:** `/locations/{id}`  
**Índice recomendado:** `(areaName, street, palettePosition)` → UNIQUE

### 3. **InventoryLog** (Contagem)

Registro de cada contagem com rastreamento completo de aderência.

```typescript
interface InventoryLog {
  id: string;
  
  // Referências
  productId: string;            // Product.id contado
  productSku: string;           // Cópia do SKU (auditoria)
  locationId: string;           // Location.id contado
  locationAddress: string;      // "EstoqueA > Rua 01 > Pos. 001"

  // Dados de contagem
  countedQuantity: 45;          // Caixas contadas
  expiryDate: Date;             // Data de validade do lote
  batchNumber?: "LOTE_2024_01";

  // Aderência
  isProductMatchLocation: true;   // SKU bate com o vinculado?
  isLayoutAdherent: true;         // Está em EstoqueA (CurvaA) ou similar?
  isABCAdherent: true;            // 100 = aderente, 0 = não
  adherenceScore: 100;

  // Validade
  daysUntilExpiry: 45;            // Positivo = vence em 45 dias
  isCriticalDate: false;          // Dentro do limiar crítico (30 dias)?
  isExpired: false;

  // Rastreamento
  conferente: "João Silva";
  notes: "Palete parcialmente utilizada";
  timestamp: Date;
}
```

**Firebase Collection:** `inventory_logs` ou `contagens`  
**Firestore Path:** `/inventory_logs/{id}`  
**Índices recomendados:**
- `productId, timestamp`
- `locationId, timestamp`
- `isABCAdherent, timestamp`
- `isCriticalDate, timestamp`

## 🔍 Regras de Negócio Implementadas

### Validação de Contagem

Quando um conferente registra uma contagem:

1. **Verificar SKU vs Localização**
   - Se `Product.sku` ≠ `Location.assignedSkuId` → **ALERTA ERROR**
   - Opções: [Corrigir] [Continuar]

2. **Verificar Aderência Layout**
   ```
   isLayoutAdherent = (Product.curve === 'A' && Location.area === 'EstoqueA')
                   OR (Product.curve === 'B' && Location.area === 'EstoqueB')
                   OR (Product.curve === 'C' && Location.area === 'EstoqueC')
   ```
   - Produtos em `Picking/AG/Marketplace` são considerados "em trânsito" → sem penalidade

3. **Verificar Aderência ABC**
   ```
   isABCAdherent = isLayoutAdherent ? 100 : 0
   ```

4. **Capturar Validade**
   ```
   daysUntilExpiry = Math.ceil((expiryDate - today) / 86400000)
   isCriticalDate = daysUntilExpiry <= Product.criticalDaysThreshold (padrão: 30)
   isExpired = daysUntilExpiry < 0
   ```

### Cálculo de Aderência para Dashboard

```typescript
adherencePercentage = (contagens_aderentes / total_contagens) * 100

// Por Área
adherencePercentageByArea['EstoqueA'] = (
  contagens_EstoqueA_aderentes / total_EstoqueA
) * 100

// Por Curva
adherencePercentageByCurve['A'] = (
  contagens_CurvaA_aderentes / total_CurvaA
) * 100
```

## 🔗 Integração com Sistema Existente

### Vínculo com Curva ABC (03.02.36.08 + 01.11)

O módulo de WMS usa a Curva ABC importada em `src/pages/curva-abc/`:

- **Product.curve** vem de → `curva_abc` collection (do Dashboard Curva ABC)
- **Product.cxPorPalete** vem de → `produtos_fatores` (relatório 01.11)
- **Product.fatorHL** vem de → `produtos_fatores` (relatório 01.11, campo B)

### Vínculo com Recebimento de NRI

Quando um NRI é registrado em `src/pages/NovaNRI.js`:

1. Os produtos da NRI são salvos em `nris` collection
2. **Internamente**, o WMS deve registrar uma entrada em `InventoryLog`:
   - `countedQuantity` = sum de todas as `qtdCx` da NRI
   - `expiryDate` = a data de validade capturada
   - `conferente` = o usuário que recebeu a NRI

## 📱 Próximas Etapas

### Fase 2: Lógica de Validação (Serviços)

Criar em `src/modules/gerenciamento-estoque/inventory/services/`:

- `countingService.ts` — registrar contagem + validar aderência
- `validationService.ts` — regras de negócio (SKU, layout, ABC)
- `expiryService.ts` — cálculo de datas críticas

### Fase 3: Componentes UI

Criar em `src/modules/gerenciamento-estoque/*/components/`:

- `LocationForm.tsx` — cadastro de endereço
- `CountingForm.tsx` — formulário de contagem
- `AlertWidget.tsx` — exibir alertas de divergência
- `AdherenceDashboard.tsx` — gráficos de aderência

## 💾 Exportação de Tipos

Todos os tipos são centralizados em `src/database/models/`:

```typescript
import {
  Product,
  Location,
  InventoryLog,
  isLayoutAdherent,
  AREA_TYPES,
  formatLocationAddress,
} from '@/database/models';
```

## 📝 Exemplo de Uso (Pseudocódigo)

```typescript
// 1. Conferente escaneou um produto em EstoqueA/Rua01/Pos001
const location = await getLocation('loc_123');  // EstoqueA > 01 > 001
const scannedSku = 'SKU_12345';

// 2. Validação: SKU corresponde?
if (scannedSku !== location.assignedSkuId) {
  // ALERTA: Produto não cadastrado para este espaço
  showAlert({
    type: 'PRODUCT_MISMATCH',
    actions: ['Corrigir', 'Continuar']
  });
}

// 3. Registrar contagem
const inventoryLog = await registerCounting({
  productId: 'prod_123',
  locationId: location.id,
  countedQuantity: 45,
  expiryDate: new Date('2025-12-31'),
  conferente: 'João Silva',
  notes: 'Palete quebrada em 10 caixas'
});

// 4. Dashboard agrega aderência
const metrics = await getAdherenceMetrics({
  periodStart: new Date('2025-01-01'),
  periodEnd: new Date('2025-01-31'),
  areaFilter: 'EstoqueA'
});
// {
//   totalCountings: 250,
//   totalAdherent: 240,
//   adherencePercentage: 96%
// }
```

---

**Próximo passo:** Após aprovação da estrutura de dados, começaremos a **Fase 2 — Lógica de Validação**.
