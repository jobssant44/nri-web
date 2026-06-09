import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider, useUser } from './context/UserContext';
import { CatalogosProvider } from './context/CatalogosContext';
import { RelatoriosMPDProvider } from './context/RelatoriosMPDContext';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import HomePage from './pages/Home';

import Dashboard from './pages/Dashboard';
import NRIs from './pages/NRIs';
import NovaNRI from './pages/NovaNRI';
import Cadastros from './pages/Cadastros';
import Importar from './pages/Importar';
import ImportacoesHub from './pages/ImportacoesHub';
import ImportarPrecosPage from './pages/ImportarPrecosPage';
import Exportar from './pages/Exportar';
import LancarAbastecimento from './pages/LancarAbastecimento';
import ImportarVendasPage from './pages/ImportarVendasPage';
import VendasPage from './pages/VendasPage';
import DashboardIV from './pages/DashboardIV';
import RegistroAbastecimentoPage from './pages/RegistroAbastecimentoPage';
import PlanificadorIV from './pages/PlanificadorIV';
import ResultadoIV from './pages/ResultadoIV';
import ConfigPicking from './pages/ConfigPicking';
import DashboardCurvaABC from './pages/curva-abc/DashboardCurvaABC';
import ImportarRelatorio from './pages/curva-abc/ImportarRelatorio';
import CountingPage from './pages/gerenciamento-estoque/CountingPage';
import ContagensEstoquePage from './pages/gerenciamento-estoque/ContagensEstoquePage';
import ImportarContagemRetroativaPage from './pages/gerenciamento-estoque/ImportarContagemRetroativaPage';
import DashboardPage from './pages/gerenciamento-estoque/DashboardPage';
import GerenciarLocalizacoesPage from './pages/gerenciamento-estoque/GerenciarLocalizacoesPage';
import EndereçamentoPage from './pages/gerenciamento-estoque/EndereçamentoPage';
// Coletas de Validade — página oculta a pedido em 2026-05-19. Descomente
// este import e a <Route> correspondente abaixo pra reativar.
// import ColetasValidadePage from './pages/gerenciamento-estoque/ColetasValidadePage';
import AderenciaABCPage from './pages/gerenciamento-estoque/AderenciaABCPage';
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
import ImportarRelatorioTMA from './pages/tma/ImportarRelatorioTMA';
import DashboardTMA from './pages/tma/DashboardTMA';
import MetasMPD from './pages/gestao-mpd/MetasMPD';
import EFCPage from './pages/gestao-mpd/EFCPage';
import EFDPage from './pages/gestao-mpd/EFDPage';
import TIPage from './pages/gestao-mpd/TIPage';
import TIFisicoPage from './pages/gestao-mpd/TIFisicoPage';
import TIFinanceiroPage from './pages/gestao-mpd/TIFinanceiroPage';
import HistogramaPage from './pages/gestao-mpd/HistogramaPage';
import PainelPlanoPage from './pages/plano-acao/PainelPlanoPage';
import NovoPlanoPage from './pages/plano-acao/NovoPlanoPage';
import GestaoFEFOPage from './pages/gestao-idade/GestaoFEFOPage';
import StockAgeIndexPage from './pages/gestao-idade/StockAgeIndexPage';
import EstoquePickingPage from './pages/gestao-idade/EstoquePickingPage';
import EstoqueEstoquePage from './pages/gestao-idade/EstoqueEstoquePage';
import ImportarPZVPage from './pages/gestao-idade/ImportarPZVPage';
import PortariaPage from './pages/portaria/PortariaPage';
import DashboardPortaria from './pages/portaria/DashboardPortaria';
import RegistrosPortaria from './pages/portaria/RegistrosPortaria';
import CadastrosPortaria from './pages/portaria/CadastrosPortaria';
import EmpresasPage from './pages/admin/EmpresasPage';
import ConfigurarEmpresaPage, { NIVEIS_SUPERVISOR } from './pages/admin/ConfigurarEmpresaPage';
import UsuariosGlobalPage from './pages/admin/UsuariosGlobalPage';
import UsuariosEmpresaPage from './pages/UsuariosEmpresaPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import ImportarVendedoresPage from './pages/cadastros/ImportarVendedoresPage';
import ReuniaoPage from './pages/reuniao/ReuniaoPage';

export default function App() {
  return (
    <UserProvider>
      <CatalogosProvider>
        <RelatoriosMPDProvider>
          <AppInner />
        </RelatoriosMPDProvider>
      </CatalogosProvider>
    </UserProvider>
  );
}

function AppInner() {
  const { usuario, carregando, empresaSelecionada, revendaSelecionada } = useUser();

  const [fixado, setFixado] = useState(() => {
    const salvo = localStorage.getItem('sidebar-fixado');
    return salvo === null ? true : salvo === 'true';
  });

  function toggleFixado() {
    setFixado(prev => {
      localStorage.setItem('sidebar-fixado', String(!prev));
      return !prev;
    });
  }

  if (carregando) return <SplashCarregando />;
  if (!usuario)   return <BrowserRouter><Login /></BrowserRouter>;

  const isSupervisor = NIVEIS_SUPERVISOR.includes(usuario.nivel);
  const isAdmin      = usuario.nivel === 'admin';
  const guardaSup    = isSupervisor ? null : '/home';
  const guardaAdmin  = isAdmin      ? null : '/home';

  const isArmazem = window.location.pathname.startsWith('/armazem');

  // key combina empresa + revenda: qualquer troca remonta o conteúdo
  // fazendo todos os useEffect dispararem novamente com os dados corretos.
  const contextKey = `${empresaSelecionada?.id || 'none'}-${revendaSelecionada || 'all'}`;

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f0eb' }}>
        <Sidebar fixado={fixado} onToggleFixado={toggleFixado} />
        <div
          key={contextKey}
          style={{
            flex:            1,
            marginLeft:      fixado ? '240px' : '56px',
            padding:         isArmazem ? 0 : '28px 32px',
            overflowY:       isArmazem ? 'hidden' : 'auto',
            height:          '100vh',
            transition:      'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
            backgroundColor: '#f0f0eb',
          }}
        >
          <Routes>
            {/* Home — destino padrão de entrada */}
            <Route path="/home"                    element={<HomePage />} />

            {/* Redireciona raiz para /home */}
            <Route path="/"                        element={<Navigate to="/home" replace />} />

            {/* Recebimento de Mercadoria */}
            <Route path="/recebimento/dashboard"   element={<Dashboard />} />
            <Route path="/nris"                    element={<NRIs />} />
            <Route path="/nova-nri"                element={<NovaNRI />} />
            <Route path="/cadastros"               element={guardaSup ? <Navigate to={guardaSup} /> : <Cadastros />} />
            <Route path="/importacoes"            element={guardaSup ? <Navigate to={guardaSup} /> : <ImportacoesHub />} />
            <Route path="/importar/precos"        element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarPrecosPage />} />
            <Route path="/importar"                element={guardaSup ? <Navigate to={guardaSup} /> : <Importar />} />
            <Route path="/exportar"                element={guardaSup ? <Navigate to={guardaSup} /> : <Exportar />} />

            {/* Reabastecimento */}
            <Route path="/reab/dashboard"          element={<DashboardIV />} />
            <Route path="/reab/lancar"             element={<LancarAbastecimento />} />
            <Route path="/reab/config"             element={guardaSup ? <Navigate to={guardaSup} /> : <ConfigPicking />} />
            <Route path="/reab/importar-vendas"    element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarVendasPage />} />
            <Route path="/reab/vendas"             element={<VendasPage />} />
            <Route path="/reab/registro"           element={<RegistroAbastecimentoPage />} />
            <Route path="/reab/planificador"       element={<PlanificadorIV />} />
            <Route path="/reab/resultado"          element={<ResultadoIV />} />
            <Route path="/reab/prepicking"         element={<PrePickingPage />} />

            {/* Curva ABC */}
            <Route path="/curva-abc/dashboard"     element={<DashboardCurvaABC />} />
            <Route path="/curva-abc/importar"      element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarRelatorio />} />

            {/* Gerenciamento de Estoque */}
            <Route path="/estoque/dashboard"              element={<DashboardPage />} />
            <Route path="/estoque/aderencia-abc"          element={<AderenciaABCPage />} />
            <Route path="/estoque/contar"                 element={<CountingPage />} />
            <Route path="/estoque/contagens"              element={<ContagensEstoquePage />} />
            <Route path="/estoque/importar-retroativa"    element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarContagemRetroativaPage />} />
            <Route path="/estoque/gerenciar-localizacoes" element={guardaSup ? <Navigate to={guardaSup} /> : <GerenciarLocalizacoesPage />} />
            <Route path="/estoque/enderecamento"          element={<EndereçamentoPage />} />
            {/* <Route path="/estoque/coletas-validade"       element={<ColetasValidadePage />} /> */}

            {/* Mapa do Armazém */}
            <Route path="/armazem/layout"          element={<LayoutArmazem />} />

            {/* Gestão de Prejuízo */}
            <Route path="/prejuizo/wqi"            element={<WQIPage />} />
            <Route path="/prejuizo/troca"          element={<TrocaPage />} />
            <Route path="/prejuizo/reposicao"      element={<ReposicaoPage />} />
            <Route path="/prejuizo/importar"       element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarRelatoriosPrejuizo />} />
            <Route path="/prejuizo/cadastros"      element={guardaSup ? <Navigate to={guardaSup} /> : <CadastrosPrejuizoPage />} />

            {/* PAVG */}
            <Route path="/pavg/conciliacao"        element={<ConciliacaoPAVG />} />
            <Route path="/pavg/importar"           element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarRelatoriosPAVG />} />

            {/* TMA */}
            <Route path="/tma/dashboard"           element={<DashboardTMA />} />
            <Route path="/tma/importar"            element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarRelatorioTMA />} />

            {/* Conciliação de Estoque */}
            <Route path="/conciliacao-estoque/diaria"   element={<ConciliacaoDiariaPage />} />
            <Route path="/conciliacao-estoque/importar" element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarConciliacaoPage />} />

            {/* Plano de Ação */}
            <Route path="/plano-acao"          element={<Navigate to="/plano-acao/painel" replace />} />
            <Route path="/plano-acao/painel"   element={<PainelPlanoPage />} />
            <Route path="/plano-acao/novo"     element={<NovoPlanoPage />} />

            {/* Gestão de Idade */}
            <Route path="/gestao-idade"                    element={<Navigate to="/gestao-idade/fefo" replace />} />
            <Route path="/gestao-idade/fefo"               element={<GestaoFEFOPage />} />
            <Route path="/gestao-idade/stock-age"          element={<StockAgeIndexPage />} />
            <Route path="/gestao-idade/estoque-picking"    element={<EstoquePickingPage />} />
            <Route path="/gestao-idade/estoque-estoque"    element={<EstoqueEstoquePage />} />
            <Route path="/gestao-idade/importar-pzv"       element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarPZVPage />} />

            {/* Cadastros — importações de catálogos compartilhados */}
            <Route path="/cadastros/importar-vendedores"   element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarVendedoresPage />} />

            {/* Reunião — gera PowerPoint consolidado */}
            <Route path="/reuniao"                         element={<ReuniaoPage />} />

            {/* Portaria */}
            <Route path="/portaria"             element={<PortariaPage />} />
            <Route path="/portaria/dashboard"   element={<DashboardPortaria />} />
            <Route path="/portaria/registros"   element={<RegistrosPortaria />} />
            <Route path="/portaria/cadastros"   element={guardaSup ? <Navigate to={guardaSup} /> : <CadastrosPortaria />} />

            {/* Gestão MDP */}
            <Route path="/gestao-mpd/efc"          element={<EFCPage />} />
            <Route path="/gestao-mpd/efd"          element={<EFDPage />} />
            <Route path="/gestao-mpd/ti"             element={<TIPage />} />
            <Route path="/gestao-mpd/ti-fisico"      element={<TIFisicoPage />} />
            <Route path="/gestao-mpd/ti-financeiro"  element={<TIFinanceiroPage />} />
            <Route path="/gestao-mpd/histograma"     element={<HistogramaPage />} />
            <Route path="/gestao-mpd/importar"     element={guardaSup ? <Navigate to={guardaSup} /> : <ImportarRelatoriosMPD />} />
            <Route path="/gestao-mpd/metas"        element={guardaSup ? <Navigate to={guardaSup} /> : <MetasMPD />} />

            {/* Supervisor */}
            <Route path="/usuarios"                element={guardaSup ? <Navigate to={guardaSup} /> : <UsuariosEmpresaPage />} />
            <Route path="/configuracoes"           element={guardaSup ? <Navigate to={guardaSup} /> : <ConfiguracoesPage />} />

            {/* Admin */}
            <Route path="/admin/empresas"          element={guardaAdmin ? <Navigate to={guardaAdmin} /> : <EmpresasPage />} />
            <Route path="/admin/empresas/:id"      element={guardaAdmin ? <Navigate to={guardaAdmin} /> : <ConfigurarEmpresaPage />} />
            <Route path="/admin/usuarios"          element={guardaAdmin ? <Navigate to={guardaAdmin} /> : <UsuariosGlobalPage />} />

            {/* Catch-all → home */}
            <Route path="*"                        element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

function SplashCarregando() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0c0c' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: '#E31837', fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: -2 }}>WJS</div>
        <div style={{ fontSize: 12, color: '#3a3a3a', marginTop: 12, letterSpacing: 2 }}>CARREGANDO...</div>
      </div>
    </div>
  );
}
