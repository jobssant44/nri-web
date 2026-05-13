import { useUser } from '../context/UserContext';
import { NIVEIS_SUPERVISOR } from '../pages/admin/ConfigurarEmpresaPage';

/**
 * Selector de revenda para páginas de importação.
 * - Ajudante/Operador/Conferente/Analista: campo fixo (sem escolha)
 * - Supervisor/Coordenador/Gerente/Diretor/Admin: dropdown com todas as revendas
 */
export default function RevendaSelector({ value, onChange }) {
  const { usuario, empresa } = useUser();

  if (!empresa) return null;

  const revendas  = empresa.revendas ?? [];
  const nivel     = usuario?.nivel ?? 'conferente';
  const podeEscolher = NIVEIS_SUPERVISOR.includes(nivel);

  // Níveis básicos: apenas a própria revenda, sem UI
  if (!podeEscolher) {
    const revenda = revendas.find(r => r.id === usuario?.revendaId);
    if (!revenda) return null;
    return (
      <div style={s.fixado}>
        <span style={s.fixadoLabel}>Revenda</span>
        <span style={s.fixadoValor}>{revenda.nome}</span>
      </div>
    );
  }

  // Supervisor matriz / admin: dropdown
  return (
    <div style={s.wrapper}>
      <label style={s.label}>Revenda</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={s.select}
      >
        <option value="">Selecione a revenda...</option>
        {revendas.map(r => (
          <option key={r.id} value={r.id}>{r.nome}</option>
        ))}
      </select>
    </div>
  );
}

const s = {
  wrapper:      { marginBottom: 16 },
  label:        { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  select:       { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, color: '#333', backgroundColor: '#fff', cursor: 'pointer', boxSizing: 'border-box' },
  fixado:       { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', backgroundColor: '#f5f5f2', borderRadius: 8, border: '1px solid #e0e0da' },
  fixadoLabel:  { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  fixadoValor:  { fontSize: 14, color: '#333', fontWeight: 500 },
};
