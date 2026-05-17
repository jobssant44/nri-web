import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { D } from '../../design';

const ABAS = [
  { path: '/gestao-idade/fefo',             label: 'Gestão de FEFO'      },
  { path: '/gestao-idade/stock-age',        label: 'Stock Age Index'     },
  { path: '/gestao-idade/estoque-picking',  label: 'Estoque x Picking'   },
  { path: '/gestao-idade/estoque-estoque',  label: 'Estoque x Estoque'   },
];

export function GestaoIdadeTabs() {
  const loc = useLocation();
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap',
      borderBottom: `2px solid ${D.borderLight}`, paddingBottom: 0,
    }}>
      {ABAS.map(t => {
        const ativo = loc.pathname === t.path;
        return (
          <Link
            key={t.path}
            to={t.path}
            style={{
              textDecoration: 'none',
              padding: '10px 18px',
              backgroundColor: ativo ? D.red : D.surface,
              color: ativo ? '#fff' : D.textSec,
              border: `1px solid ${ativo ? D.red : D.border}`,
              borderBottom: ativo ? `1px solid ${D.red}` : `1px solid ${D.border}`,
              borderRadius: '8px 8px 0 0',
              fontSize: 13,
              fontWeight: ativo ? 700 : 500,
              fontFamily: D.font,
              transition: D.transition,
              marginBottom: -2,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
