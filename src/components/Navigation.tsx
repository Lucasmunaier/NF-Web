import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  CheckCircle, 
  Users, 
  Settings, 
  LogOut, 
  Search,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { UserRole } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const { user, logout } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: Object.values(UserRole) },
    { icon: FileText, label: 'Notas Fiscais', path: '/invoices', roles: Object.values(UserRole) },
    { icon: Users, label: 'Auditoria', path: '/users', roles: [UserRole.AUDITOR] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role as UserRole));

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isOpen ? 260 : 80 }}
      className="fixed left-0 top-0 h-full bg-slate-900 text-slate-300 border-r border-slate-800 z-50 flex flex-col"
    >
      <div className={cn("p-6 flex items-center gap-3 border-b border-slate-800", !isOpen && "justify-center")}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold shrink-0">P</div>
        {isOpen && <span className="text-lg font-bold text-white tracking-tight">PAMA-LS</span>}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="ml-auto p-1 rounded-lg hover:bg-slate-800 text-slate-500"
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {filteredMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "sidebar-item text-sm font-medium",
              isActive ? "sidebar-item-active" : "sidebar-item-inactive",
              !isOpen && "justify-center px-0"
            )}
          >
            <item.icon size={20} className="shrink-0" />
            {isOpen && (
              <span className="flex-1 flex items-center justify-between">
                {item.label}
                {item.label === 'Aprovações' && <span className="bg-brand-600 text-[10px] px-1.5 py-0.5 rounded text-white">12</span>}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-4">
        <div className={cn("flex items-center gap-3", !isOpen && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.username?.charAt(0) || '?'}
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.username}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{user?.role}</p>
            </div>
          )}
        </div>
        
        <button 
          onClick={() => logout()}
          className={cn(
            "w-full flex items-center gap-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-medium",
            isOpen ? "px-3 py-2" : "justify-center py-2 px-0"
          )}
          title="Sair do Sistema"
        >
          <LogOut size={16} />
          {isOpen && <span>Sair do Sistema</span>}
        </button>
      </div>
    </motion.aside>
  );
}

export function Header() {
  return (
    <header className="h-16 sticky top-0 bg-white border-b border-slate-200 z-40 px-8 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <h2 className="text-lg font-semibold text-slate-800">Dashboard Geral</h2>
        <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded">API: v2.4.1-Stable</span>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={() => toast.success('Sistema Sincronizado')}
          className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded shadow-sm hover:bg-brand-700 transition-colors"
        >
          Sincronizar SILOMS
        </button>
        <div className="w-px h-6 bg-slate-200 mx-2"></div>
        <div className="relative">
          <div className="w-2 h-2 bg-red-500 rounded-full absolute -top-0.5 -right-0.5 ring-2 ring-white"></div>
          <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
            <CheckCircle size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}
