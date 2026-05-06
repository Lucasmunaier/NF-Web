import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, User as UserIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (username !== 'Admin' && !/^\d{11}$/.test(username)) {
      toast.error('Usuário inválido. Digite seu CPF com 11 dígitos.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Iniciando comunicação segura...');

    try {
      const profile = await login(username, password, setStatusMessage);
      if (profile) {
        toast.success(`Bem-vindo, ${profile.username}!`);
        // Auditor vai direto para Notas Fiscais
        navigate(profile.role === 'Auditor' ? '/invoices' : '/');
      } else {
        toast.error('Credenciais inválidas ou acesso negado.');
        setStatusMessage('');
      }
    } catch (error: any) {
      console.error('Falha crítica na autenticação:', error);
      const msg = error?.message?.includes('permission')
        ? 'Erro de permissão no servidor. Tente novamente.'
        : 'Erro ao conectar. Verifique sua rede.';
      toast.error(msg);
      setStatusMessage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 text-white shadow-xl shadow-brand-200 mb-6 font-bold text-2xl">
            P
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Portal PAMA-LS</h1>
          <p className="text-slate-500 mt-2 font-medium">Sistema de Auditoria e Gestão de NF</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Usuário</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-sm font-medium"
                  placeholder="Seu login (ex: 12500688607)"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-sm font-medium"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-200 active:scale-[0.98] disabled:opacity-50 text-sm uppercase tracking-widest mt-4 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="animate-spin" size={18} />}
              {isSubmitting ? 'Autenticando...' : 'Entrar no Sistema'}
            </button>
          </form>

          {/* Log do worker em tempo real */}
          {statusMessage && (
            <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-3 rounded-lg border border-slate-700 mt-4 flex items-center gap-3 overflow-hidden">
              <Loader2 size={14} className="animate-spin text-brand-400 shrink-0" />
              <span className="truncate">{statusMessage}</span>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Shield size={14} />
            <span>Conexão Segura · SILOMS Integrated</span>
          </div>
        </motion.div>

        <p className="text-center text-slate-400 text-xs mt-8">
          © 2026 Parque de Material de Aeronáutica de Lagoa Santa
        </p>
      </div>
    </div>
  );
}
