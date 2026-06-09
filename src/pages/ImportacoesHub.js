/**
 * Hub central de Importações.
 *
 * Página única que reúne todas as importações do sistema, categorizadas por
 * função. Cada card é um link pra tela de importação específica (que continua
 * existindo na sua rota original — esse hub só centraliza o acesso).
 *
 * Fase 1: cards estáticos com link.
 * Fase 2 (futura): cada card mostra "última importação" + status visual.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  D, PageContainer, PageHeader,
} from '../design';

// Cada item: { titulo, descricao, rota, icone }
const CATEGORIAS = [
  {
    titulo: 'Catálogos',
    cor: D.blue,
    icone: '📚',
    items: [
      {
        titulo: 'Catálogo de Produtos',
        descricao: 'Relatório 01.11 — código, descrição, paletização, lastro, hecto e demais fatores',
        rota: '/configuracoes',
      },
      {
        titulo: 'Picking Config',
        descricao: 'CSV com produtos cadastrados em Picking (código, nome, espaços do palete)',
        rota: '/reab/config',
      },
      {
        titulo: '01.02.46 — Vendedores',
        descricao: 'Mapeamento código → nome do RN (Representante de Negócio). Usado em Reposição, WQI e Troca',
        rota: '/cadastros/importar-vendedores',
      },
      {
        titulo: 'Preços',
        descricao: 'Excel/CSV com Código + Preço 01 + Preço 02 (fallback). Usado em cálculos monetários do sistema',
        rota: '/importar/precos',
      },
    ],
  },
  {
    titulo: 'Vendas & Curva ABC',
    cor: D.red,
    icone: '📊',
    items: [
      {
        titulo: '03.02.36.08',
        descricao: 'Relatório de vendas diárias. Alimenta também a Curva ABC mensal automaticamente',
        rota: '/reab/importar-vendas',
        destaque: true,
      },
    ],
  },
  {
    titulo: 'Análises & Operacional',
    cor: D.amber,
    icone: '🗂',
    items: [
      {
        titulo: 'PZV',
        descricao: 'Prazo de Validade (PZV) por SKU — usado em Gestão de Idade e FEFO',
        rota: '/gestao-idade/importar-pzv',
      },
      {
        titulo: 'Coletas de Validade (retroativa)',
        descricao: 'Importar coletas antigas via Excel/CSV — alimenta Gestão de Idade e FEFO',
        rota: '/estoque/importar-retroativa',
      },
      {
        titulo: 'Conciliação 02.05.02',
        descricao: 'Relatório de conciliação de estoque',
        rota: '/conciliacao-estoque/importar',
      },
      {
        titulo: 'Prejuízo',
        descricao: 'Relatórios de prejuízo (WQI, troca, reposição)',
        rota: '/prejuizo/importar',
      },
      {
        titulo: 'MPD',
        descricao: 'Materiais Produtivos Diretos — relatórios 03.11.20, motoristas, etc',
        rota: '/gestao-mpd/importar',
      },
      {
        titulo: 'TMA',
        descricao: 'Tempo Médio de Atendimento',
        rota: '/tma/importar',
      },
      {
        titulo: 'PAVG',
        descricao: 'Vendas PAVG',
        rota: '/pavg/importar',
      },
    ],
  },
];

export default function ImportacoesHub() {
  const navigate = useNavigate();

  return (
    <PageContainer maxWidth={1100}>
      <PageHeader
        kicker="Hub central"
        titulo="Importações"
      />

      {CATEGORIAS.map(cat => (
        <div key={cat.titulo} style={{ marginBottom: 28 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 18 }}>{cat.icone}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: cat.cor,
            }}>
              {cat.titulo}
            </div>
            <div style={{ flex: 1, height: 1, background: D.borderLight }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {cat.items.map(item => (
              <button
                key={item.rota}
                onClick={() => navigate(item.rota)}
                style={{
                  textAlign: 'left',
                  padding: '16px 18px',
                  backgroundColor: D.surface,
                  border: `1px solid ${item.destaque ? cat.cor : D.border}`,
                  borderLeft: `4px solid ${cat.cor}`,
                  borderRadius: D.radius,
                  cursor: 'pointer',
                  transition: D.transition,
                  boxShadow: D.shadow,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = D.shadowMd;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = D.shadow;
                }}
              >
                <div style={{
                  fontSize: 15, fontWeight: 800,
                  color: D.text, marginBottom: 6, letterSpacing: -0.2,
                }}>
                  {item.titulo}
                </div>
                <div style={{
                  fontSize: 12, color: D.textSec, lineHeight: 1.5,
                  marginBottom: 10,
                }}>
                  {item.descricao}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: cat.cor,
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  Importar →
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </PageContainer>
  );
}
