import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import ConversasList from "@/pages/ConversasList";
import ConversaDetail from "@/pages/ConversaDetail";
import GrupoChat from "@/pages/GrupoChat";
import DemandasList from "@/pages/DemandasList";
import DemandasLojas from "@/pages/DemandasLojas";
import DemandaChat from "@/pages/DemandaChat";
import LojaNovaDemanda from "@/pages/LojaNovaDemanda";
import LojaMinhasDemandas from "@/pages/LojaMinhasDemandas";
import LojaAgenda from "@/pages/LojaAgenda";
import LojaCashback from "@/pages/LojaCashback";
import NotificacoesList from "@/pages/NotificacoesList";
import Perfil from "@/pages/Perfil";
import NotFound from "@/pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner position="top-center" richColors closeButton />
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<ConversasList />} />
            <Route path="/conversas/:otherId" element={<ConversaDetail />} />
            <Route path="/grupos/:groupId" element={<GrupoChat />} />
            <Route path="/demandas" element={<DemandasList />} />
            <Route path="/demandas-lojas" element={<DemandasLojas />} />
            <Route path="/demandas/:id" element={<DemandaChat />} />
            <Route path="/nova-demanda" element={<LojaNovaDemanda />} />
            <Route path="/agenda" element={<LojaAgenda />} />
            <Route path="/cashback" element={<LojaCashback />} />
            <Route path="/minhas-demandas" element={<LojaMinhasDemandas />} />
            <Route path="/notificacoes" element={<NotificacoesList />} />
            <Route path="/perfil" element={<Perfil />} />
          </Route>
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
