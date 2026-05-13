import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

export default function Login() {
  const [email,      setEmail]      = useState('');
  const [senha,      setSenha]      = useState('');
  const [erro,       setErro]       = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return; }
    setCarregando(true);
    setErro('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha.trim());
      // onAuthStateChanged in UserContext handles the rest
    } catch (err) {
      const msg = {
        'auth/user-not-found':  'Usuário não encontrado.',
        'auth/wrong-password':  'Senha incorreta.',
        'auth/invalid-email':   'E-mail inválido.',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
      }[err.code] ?? 'Erro ao entrar. Verifique suas credenciais.';
      setErro(msg);
    }
    setCarregando(false);
  }

  return (
    <div style={s.root}>
      {/* ── Painel esquerdo ────────────────────────────────────── */}
      <div style={s.left}>
        <div style={s.bgMark} aria-hidden>WJS</div>

        <div style={s.leftContent}>
          <div style={s.logo}>WJS</div>
          <div style={s.logoSub}>WAREHOUSE JOB SYSTEM</div>

          <div style={s.divisor} />

          <p style={s.tagline}>
            Sistema inteligente de gerenciamento<br />
            de estoque.
          </p>
        </div>
      </div>

      {/* ── Painel direito ─────────────────────────────────────── */}
      <div style={s.right}>
        <div style={s.formBox}>
          <div style={s.formHeader}>
            <div style={s.formEyebrow}>ACESSO AO SISTEMA</div>
            <h1 style={s.formTitle}>Bem‑vindo</h1>
            <p style={s.formSub}>Entre com suas credenciais para continuar.</p>
          </div>

          <form onSubmit={entrar} style={{ width: '100%' }}>
            <div style={s.field}>
              <label style={s.label}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="username"
                style={s.input}
                onFocus={e => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227,24,55,0.10)'; }}
                onBlur={e => { e.target.style.borderColor = '#ddddd8'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
                style={s.input}
                onFocus={e => { e.target.style.borderColor = '#E31837'; e.target.style.boxShadow = '0 0 0 3px rgba(227,24,55,0.10)'; }}
                onBlur={e => { e.target.style.borderColor = '#ddddd8'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {erro && <div style={s.erroBox}>{erro}</div>}

            <button
              type="submit"
              disabled={carregando}
              style={{ ...s.btnEntrar, opacity: carregando ? 0.65 : 1, cursor: carregando ? 'not-allowed' : 'pointer' }}
              onMouseEnter={e => { if (!carregando) { e.currentTarget.style.backgroundColor = '#c41730'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(227,24,55,0.28)'; } }}
              onMouseLeave={e => { if (!carregando) { e.currentTarget.style.backgroundColor = '#E31837'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; } }}
            >
              {carregando ? 'Entrando...' : 'Entrar →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const s = {
  root:        { minHeight: '100vh', display: 'flex', fontFamily: "'Bricolage Grotesque', sans-serif" },
  left:        { width: '52%', backgroundColor: '#0c0c0c', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', padding: '48px 52px' },
  bgMark:      { position: 'absolute', right: -40, bottom: -60, fontSize: 320, fontWeight: 800, color: 'rgba(227,24,55,0.04)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none', fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: -10 },
  leftContent: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  logo:        { fontSize: 52, fontWeight: 800, color: '#E31837', letterSpacing: -2, lineHeight: 1, fontFamily: "'Bricolage Grotesque', sans-serif" },
  logoSub:     { fontSize: 9, fontWeight: 600, color: '#3a3a3a', letterSpacing: 3, marginTop: 8, textTransform: 'uppercase' },
  divisor:     { width: 48, height: 2, backgroundColor: '#E31837', marginTop: 28, marginBottom: 24 },
  tagline:     { fontSize: 15, color: '#5a5a5a', lineHeight: 1.7, margin: 0, fontWeight: 400 },
  statsRow:    { display: 'flex', gap: 32, marginTop: 40 },
  stat:        { display: 'flex', flexDirection: 'column', gap: 3 },
  statNum:     { fontSize: 24, fontWeight: 700, color: '#e8e8e8', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" },
  statTxt:     { fontSize: 9, color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 },
  leftFooter:  { fontSize: 10, color: '#2a2a2a', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 },
  right:       { flex: 1, backgroundColor: '#f0f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' },
  formBox:     { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  formHeader:  { marginBottom: 36, width: '100%' },
  formEyebrow: { fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: '#E31837', textTransform: 'uppercase', marginBottom: 10 },
  formTitle:   { fontSize: 36, fontWeight: 800, color: '#0c0c0c', margin: 0, marginBottom: 8, letterSpacing: -1, lineHeight: 1.1, fontFamily: "'Bricolage Grotesque', sans-serif" },
  formSub:     { fontSize: 13, color: '#888', margin: 0, fontWeight: 400, lineHeight: 1.5 },
  field:       { marginBottom: 18, width: '100%' },
  label:       { display: 'block', fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 },
  input:       { width: '100%', padding: '11px 14px', border: '1px solid #ddddd8', borderRadius: 5, fontSize: 14, backgroundColor: '#fff', color: '#111', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', fontFamily: "'Bricolage Grotesque', sans-serif" },
  erroBox:     { padding: '10px 14px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 5, fontSize: 12, color: '#991b1b', marginBottom: 16, fontWeight: 500 },
  btnEntrar:   { width: '100%', padding: '13px', backgroundColor: '#E31837', color: '#fff', border: 'none', borderRadius: 5, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, transition: 'all 0.18s', fontFamily: "'Bricolage Grotesque', sans-serif", marginTop: 6 },
};
