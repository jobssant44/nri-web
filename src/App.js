import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NRIs from './pages/NRIs';
import NovaNRI from './pages/NovaNRI';
import Cadastros from './pages/Cadastros';
import Usuarios from './pages/Usuarios';
import Importar from './pages/Importar';
import Exportar from './pages/Exportar';
import Sidebar from './components/Sidebar';
import LancarAbastecimento from './pages/LancarAbastecimento';
import DashboardIV from './pages/DashboardIV';
import ConfigPicking from './pages/ConfigPicking';

export default function App() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const salvo = localStorage.getItem('nri-usuario');
    if (salvo) setUsuario(JSON.parse(salvo));
  }, []);

  function login(dados) {
    localStorage.setItem('nri-usuario', JSON.stringify(dados));
    setUsuario(dados);
  }

  function logout() {
    localStorage.removeItem('nri-usuario');
    setUsuario(null);
  }

  if (!usuario) return <Login onLogin={login} />;

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        <Sidebar usuario={usuario} onLogout={logout} />
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nris" element={<NRIs usuario={usuario} />} />
            <Route path="/nova-nri" element={<NovaNRI usuario={usuario} />} />
            <Route path="/cadastros" element={usuario.nivel === 'supervisor' ? <Cadastros /> : <Navigate to="/" />} />
            <Route path="/usuarios" element={usuario.nivel === 'supervisor' ? <Usuarios /> : <Navigate to="/" />} />
            <Route path="/importar" element={usuario.nivel === 'supervisor' ? <Importar /> : <Navigate to="/" />} />
            <Route path="/exportar" element={usuario.nivel === 'supervisor' ? <Exportar /> : <Navigate to="/" />} />
            <Route path="/reab/dashboard" element={<DashboardIV />} />
            <Route path="/reab/lancar" element={<LancarAbastecimento usuario={usuario} />} />
            <Route path="/reab/config" element={usuario.nivel === 'supervisor' ? <ConfigPicking /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}