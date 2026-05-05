import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  RotateCcw,
  TrendingUp
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import { db } from '../services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

// Tipagem baseada no que o Python salva
interface Invoice {
  id: string;
  numero: string;
  status: string;
}

const trendData = [
  { name: 'Jan', value: 4000 },
  { name: 'Fev', value: 3000 },
  { name: 'Mar', value: 2000 },
  { name: 'Abr', value: 2780 },
  { name: 'Mai', value: 1890 },
  { name: 'Jun', value: 2390 },
];

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    pendente: 0,
    aprovada: 0,
    retornada: 0
  });

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'notas_fiscais'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoices = snapshot.docs.map(doc => doc.data() as Invoice);
      setStats({
        total: invoices.length,
        // O Python salva o status capitalizado, mas vamos garantir lendo case-insensitive
        pendente: invoices.filter(i => i.status.toLowerCase() === 'pendente').length,
        aprovada: invoices.filter(i => i.status.toLowerCase() === 'conferida' || i.status.toLowerCase() === 'aprovada').length,
        retornada: invoices.filter(i => i.status.toLowerCase() === 'retornada').length
      });
    }, (error) => {
      console.error("Erro no listener do Dashboard:", error);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Bem-vindo ao sistema de auditoria PAMA-LS.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Notas', value: stats.total.toString(), icon: FileText, color: 'text-slate-900', bg: 'border-slate-200', trend: '+12% desde ontem', trendColor: 'text-green-600' },
          { label: 'Pendentes', value: stats.pendente.toString(), icon: Clock, color: 'text-brand-600', bg: 'border-slate-200', trend: 'Aguardando Operador', trendColor: 'text-slate-400' },
          { label: 'Em Aprovação', value: stats.aprovada.toString(), icon: CheckCircle2, color: 'text-amber-500', bg: 'border-slate-200', trend: 'Média: 4.2h p/ despacho', trendColor: 'text-slate-400' },
          { label: 'Retornadas', value: stats.retornada.toString().padStart(2, '0'), icon: RotateCcw, color: 'text-rose-600', bg: 'border-l-4 border-l-rose-500', trend: 'Correção necessária', trendColor: 'text-rose-500' },
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={stat.label} 
            className={cn("bg-white p-5 rounded-xl border shadow-sm", stat.bg)}
          >
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={cn("text-3xl font-bold", stat.color)}>{stat.value}</p>
            <p className={cn("text-[10px] mt-2 font-medium", stat.trendColor)}>{stat.trend}</p>
          </motion.div>
        ))}
      </div>

      {/* A parte de gráficos abaixo é ilustrativa para o seu design */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800">Histórico de Movimentação</h3>
            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
              <TrendingUp size={12} />
              +8.4% ESTE MÊS
            </div>
          </div>
          <div className="flex-1 p-6 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#colorVal)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <FileText size={64} />
             </div>
             <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4">Status de Automação</h4>
             <div className="space-y-4">
               <div className="flex justify-between items-center text-[11px]">
                 <span className="text-slate-400 font-medium">Selenium (Worker PAMA-LS):</span>
                 <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    ONLINE
                 </span>
               </div>
             </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
             <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest mb-4">Meta Mensal de Conferência</h4>
             <div className="flex items-center gap-6">
                <div className="relative w-24 h-24">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={[{value: 75}, {value: 25}]}
                         innerRadius={30}
                         outerRadius={40}
                         paddingAngle={0}
                         dataKey="value"
                         startAngle={90}
                         endAngle={-270}
                       >
                         <Cell fill="#6366f1" />
                         <Cell fill="#f1f5f9" />
                       </Pie>
                     </PieChart>
                   </ResponsiveContainer>
                   <div className="absolute inset-0 flex items-center justify-center font-bold text-lg text-slate-800">75%</div>
                </div>
                <div className="flex-1 space-y-2">
                   <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-brand-600"></div>
                      Conferidas
                   </div>
                   <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                      A processar
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}