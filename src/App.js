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
import ImportarVendasPage from './pages/ImportarVendasPage';
import VendasPage from './pages/VendasPage';
import DashboardIV from './pages/DashboardIV';
import RegistroAbastecimentoPage from './pages/RegistroAbastecimentoPage';
import PlanificadorIV from './pages/PlanificadorIV';
import ConfigPicking from './pages/ConfigPicking';
import DashboardCurvaABC from './pages/curva-abc/DashboardCurvaABC';
import ImportarRelatorio from './pages/curva-abc/ImportarRelatorio';
import CountingPage from './pages/gerenciamento-estoque/CountingPage';
import DashboardPage from './pages/gerenciamento-estoque/DashboardPage';
import GerenciarLocalizacoesPage from './pages/gerenciamento-estoque/GerenciarLocalizacoesPage';
import EndereçamentoPage from './pages/gerenciamento-estoque/EndereçamentoPage';
import ColetasValidadePage from './pages/gerenciamento-estoque/ColetasValidadePage';
import LayoutArmazem from './pages/LayoutArmazem';
import ImportarRelatoriosPrejuizo from './pages/gestao-prejuizo/ImportarRelatoriosPrejuizo';
import WQIPage from './pages/gestao-prejuizo/WQIPage';
import CadastrosPrejuizoPage from './pages/gestao-prejuizo/CadastrosPrejuizoPage';
import TrocaPage from './pages/gestao-prejuizo/Troca/TrocaPage';
import ReposicaoPage from './pages/gestao-prejuizo/Reposição/ReposicaoPage';
import PrePickingPage from './pages/PrePickingPage';
import ImportarRelatoriosPAVG from './pages/pavg/ImportarRelatoriosPAVG';
import ConciliacaoPAVG from './pages/pavg/ConciliacaoPAVG';
import ImportarConciliacaoPage from './pages/conciliacao-estoque/ImportarConciliacaoPage';
import ConciliacaoDiariaPage from './pages/conciliacao-estoque/ConciliacaoDiariaPage';
import ImportarRelatoriosMPD from './pages/gestao-mpd/ImportarRelatoriosMPD';
import MetasMPD from './pages/gestao-mpd/MetasMPD';
import EFCPage from './pages/gestao-mpd/EFCPage';
import EFDPage from './pages/gestao-mpd/EFDPage';
import TIPage from './pages/gestao-mpd/TIPage';
import HistogramaPage from './pages/gestao-mpd/HistogramaPage';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [fixado, setFixado] = useState(() => {
    const salvo = localStorage.getItem('sidebar-fixado');
    return salvo === null ? true : salvo === 'true';
  });

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

  function toggleFixado() {
    setFixado(prev => {
      localStorage.setItem('sidebar-fixado', String(!prev));
      return !prev;
    });
  }

  if (!usuario) return <Login onLogin={login} />;

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f0eb' }}>
        <Sidebar usuario={usuario} onLogout={logout} fixado={fixado} onToggleFixado={toggleFixado} />
        <div style={{ flex: 1, marginLeft: fixado ? '240px' : '56px', padding: window.location.pathname.startsWith('/armazem') ? 0 : '28px 32px', overflowY: window.location.pathname.startsWith('/armazem') ? 'hidden' : 'auto', height: '100vh', transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)', backgroundColor: '#f0f0eb' }}>
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
            <Route path="/reab/importar-vendas" element={usuario.nivel === 'supervisor' ? <ImportarVendasPage /> : <Navigate to="/" />} />
            <Route path="/reab/vendas" element={<VendasPage />} />
            <Route path="/reab/registro" element={<RegistroAbastecimentoPage usuario={usuario} />} />
            <Route path="/reab/planificador" element={<PlanificadorIV />} />
            <Route path="/reab/prepicking" element={<PrePickingPage />} />
            <Route path="/curva-abc/dashboard" element={<DashboardCurvaABC />} />
            <Route path="/curva-abc/importar" element={usuario.nivel === 'supervisor' ? <ImportarRelatorio /> : <Navigate to="/" />} />
            <Route path="/estoque/dashboard" element={<DashboardPage />} />
            <Route path="/estoque/contar" element={<CountingPage usuario={usuario} />} />
            <Route path="/estoque/gerenciar-localizacoes" element={usuario.nivel === 'supervisor' ? <GerenciarLocalizacoesPage /> : <Navigate to="/" />} />
            <Route path="/estoque/enderecamento" element={<EndereçamentoPage />} />
            <Route path="/estoque/coletas-validade" element={<ColetasValidadePage />} />
            <Route path="/armazem/layout" element={<LayoutArmazem />} />
            <Route path="/prejuizo/wqi" element={<WQIPage />} />
            <Route path="/prejuizo/troca"      element={<TrocaPage />} />
            <Route path="/prejuizo/reposicao" element={<ReposicaoPage />} />
            <Route path="/prejuizo/importar" element={usuario.nivel === 'supervisor' ? <ImportarRelatoriosPrejuizo /> : <Navigate to="/" />} />
            <Route path="/prejuizo/cadastros" element={usuario.nivel === 'supervisor' ? <CadastrosPrejuizoPage /> : <Navigate to="/" />} />
            <Route path="/pavg/conciliacao" element={<ConciliacaoPAVG />} />
            <Route path="/pavg/importar" element={usuario.nivel === 'supervisor' ? <ImportarRelatoriosPAVG /> : <Navigate to="/" />} />
            <Route path="/conciliacao-estoque/diaria" element={<ConciliacaoDiariaPage />} />
            <Route path="/conciliacao-estoque/importar" element={usuario.nivel === 'supervisor' ? <ImportarConciliacaoPage /> : <Navigate to="/" />} />
            <Route path="/gestao-mpd/efc"        element={<EFCPage />} />
            <Route path="/gestao-mpd/efd"        element={<EFDPage />} />
            <Route path="/gestao-mpd/ti"         element={<TIPage />} />
            <Route path="/gestao-mpd/histograma" element={<HistogramaPage />} />
            <Route path="/gestao-mpd/importar"   element={usuario.nivel === 'supervisor' ? <ImportarRelatoriosMPD /> : <Navigate to="/" />} />
            <Route path="/gestao-mpd/metas"      element={usuario.nivel === 'supervisor' ? <MetasMPD /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}