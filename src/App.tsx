import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { Sidebar, Header } from './components/Navigation';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { UserAdmin } from './pages/UserAdmin';
import { Settings } from './pages/Settings';
import { cn } from './lib/utils';

// Tipagem para as props da rota protegida
interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  requireAdmin?: boolean;
}

function ProtectedRoute({ children, roles, requireAdmin }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="w-12 h-12 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin"></div>
      <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Aguardando SILOMS...</p>
    </div>
  );
  
  // 1. Se não está logado, joga pro Login
  if (!user) return <Navigate to="/login" />;
  
  // 2. Se a rota exige ser Admin e o usuário não é, joga pra tela inicial
  if (requireAdmin && !user.isAdmin) return <Navigate to="/" />;
  
  // 3. Se a rota exige um Cargo específico (Auditor, Aprovador) e ele não tem, joga pra tela inicial
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;

  return <>{children}</>;
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div 
        className={cn(
          "flex-1 flex flex-col transition-all duration-300",
          sidebarOpen ? "pl-[260px]" : "pl-[80px]"
        )}
      >
        <Header />
        <main className="p-8 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout><Dashboard /></MainLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/invoices" element={
            <ProtectedRoute>
              <MainLayout><Invoices /></MainLayout>
            </ProtectedRoute>
          } />
          
          {/* Exemplo de rota apenas para Aprovadores operacionais */}
          <Route path="/approvals" element={
            <ProtectedRoute roles={['Aprovador']}>
              <MainLayout><Invoices /></MainLayout>
            </ProtectedRoute>
          } />
          
          {/* Rota de Administração blindada com a nova flag requireAdmin */}
          <Route path="/users" element={
            <ProtectedRoute requireAdmin={true}>
              <MainLayout><UserAdmin /></MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute requireAdmin={true}>
              <MainLayout><Settings /></MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}