# Arquitetura - Modulo de Gerenciamento de Estoque

## Estrutura de Dados

### Entidades Principais

**PRODUTO**
- id: ID unico no Firestore
- sku: Codigo SKU
- name: Nome do produto
- curve: A (alto giro), B (medio), C (baixo)
- cxPorPalete: Caixas por palete

**LOCALIZACAO**
- id: ID unico
- areaName: EstoqueA, EstoqueB, EstoqueC, Picking, AG, Marketplace
- street: Corredor (ex: Corredor 1)
- position: Posicao (ex: P1)
- assignedSkuId: SKU vinculado OBRIGATORIO
- capacity: Capacidade maxima

**INVENTARIO LOG**
- id: ID unico
- productId: ID do produto contado
- locationId: ID da localizacao
- countedQuantity: Quantidade contada
- expiryDate: Data de validade
- daysUntilExpiry: Dias ate vencer
- isLayoutAdherent: Produto no layout correto?
- adherenceScore: 0 (nao aderente) ou 100 (aderente)
- conferente: Nome de quem fez contagem

## Mapeamento ABC x Layout

- Curva A deve estar em EstoqueA
- Curva B deve estar em EstoqueB
- Curva C deve estar em EstoqueC
- Picking, AG, Marketplace: Transitorio (sem penalidade)

## Calculos Importantes

### Dias ate Vencimento
Math.floor((expiryDate - hoje) / (1000 * 60 * 60 * 24))
- Negativo = vencido
- 0-30 = critico
- > 30 = OK

### Pre-bloqueio e Bloqueio (Etiqueta)
- Pre-bloqueio = Data Validade - 45 dias
- Bloqueio = Data Validade - 30 dias

### Qtde Total (Etiqueta)
Qtde TT = (Qtd PLT x cxPorPalete) + Qtd CX

## Validacoes Obrigatorias

1. Produto existe?
2. Localizacao existe?
3. Quantidade valida (>0)?
4. Data de validade valida?
5. SKU do produto confere com SKU da localizacao?
6. Layout correto (A->EstoqueA)?
7. Produto vencido ou critico?

## Metricas de Aderencia

Aderencia % = (Contagens Aderentes / Total) x 100

Desagregacao:
- Por Area: EstoqueA, EstoqueB, EstoqueC, Picking
- Por Curva: A, B, C

## Fases de Implementacao

Fase 1: Data Models (types.ts) - CONCLUIDA
Fase 2: Servicos de Validacao - CONCLUIDA
Fase 3: Componentes UI - EM PROGRESSO
Fase 4: Integracao com NRI - PROXIMA
