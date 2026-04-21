import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function Login({ onLogin }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!nome || !senha) { setErro('Preencha nome e senha.'); return; }
    setCarregando(true);
    setErro('');
    if (nome.trim() === 'Jobson' && senha.trim() === '3573') {
      onLogin({ nome: 'Jobson', nivel: 'supervisor' });
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, 'usuarios'));
      const usuarios = snapshot.docs.map(d => d.data());
      const encontrado = usuarios.find(u =>
        u.nome.toLowerCase() === nome.trim().toLowerCase() && u.senha === senha.trim()
      );
      if (encontrado) {
        onLogin({ nome: encontrado.nome, nivel: encontrado.nivel });
      } else {
        setErro('Nome ou senha incorretos.');
      }
    } catch (e) {
      setErro('Erro ao conectar. Verifique sua conexão.');
    }
    setCarregando(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fafafa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Left side - Branding */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '50%',
        height: '100vh',
        background: 'linear-gradient(135deg, #E31837 0%, #c41730 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}>
        <div style={{
          fontSize: 64,
          fontWeight: 'bold',
          letterSpacing: -2,
          marginBottom: 16,
        }}>
          WJS
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: 2,
          textAlign: 'center',
          opacity: 0.95,
        }}>
          WAREHOUSE JOBSON<br />STATION
        </div>
        <div style={{
          marginTop: 40,
          textAlign: 'center',
          fontSize: 14,
          opacity: 0.8,
          maxWidth: 300,
        }}>
          Sistema inteligente de gerenciamento de estoque e recebimento de mercadoria
        </div>
      </div>

      {/* Right side - Login form */}
      <div style={{
        position: 'absolute',
        right: 0,
        width: '50%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 380,
          padding: '0 40px',
        }}>
          <h2 style={{
            fontSize: 28,
            fontWeight: 600,
            color: '#1a1a2e',
            marginBottom: 8,
          }}>
            Bem-vindo
          </h2>
          <p style={{
            fontSize: 14,
            color: '#888',
            marginBottom: 32,
          }}>
            Faça login com suas credenciais para continuar
          </p>

          <form onSubmit={entrar}>
            <div style={{ marginBottom: 20 }}>
              <label style={{
                fontSize: 13,
                color: '#555',
                display: 'block',
                marginBottom: 8,
                fontWeight: 500,
              }}>
                Nome
              </label>
              <input
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 15,
                  boxSizing: 'border-box',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome"
                onFocus={(e) => {
                  e.target.style.borderColor = '#E31837';
                  e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#ddd';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                fontSize: 13,
                color: '#555',
                display: 'block',
                marginBottom: 8,
                fontWeight: 500,
              }}>
                Senha
              </label>
              <input
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 15,
                  boxSizing: 'border-box',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Sua senha"
                onFocus={(e) => {
                  e.target.style.borderColor = '#E31837';
                  e.target.style.boxShadow = '0 0 0 3px rgba(227, 24, 55, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#ddd';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {erro && (
              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                padding: '12px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 16,
              }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: carregando ? '#ccc' : '#E31837',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 15,
                fontWeight: 600,
                cursor: carregando ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                opacity: carregando ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!carregando) {
                  e.target.style.backgroundColor = '#c41730';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 16px rgba(227, 24, 55, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!carregando) {
                  e.target.style.backgroundColor = '#E31837';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              {carregando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div style={{
            marginTop: 24,
            padding: '16px',
            backgroundColor: '#f9f9f9',
            borderRadius: 6,
            fontSize: 12,
            color: '#666',
            textAlign: 'center',
          }}>
            <strong>Demo:</strong> Use Jobson / 3573
          </div>
        </div>
      </div>
    </div>
  );
}