import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '../services/firebase';
import {
  collection, query, onSnapshot, addDoc, serverTimestamp,
  doc, updateDoc, getDoc, deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  FileText, RotateCcw, CheckCircle, Search, ChevronDown,
  ExternalLink, Send, Mail, X, Layers, AlertTriangle,
  CheckSquare, Square, LayoutList, Filter, Clock, Save,
  Loader2, File, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import type { Recipient } from './Settings';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PdfDoc { nome: string; url: string; }

interface NF {
  id: string;
  numero: string;
  fornecedor: string;
  valor_bruto?: string;
  contrato?: string;
  cnpj?: string;
  status: string;
  documentos_pdf?: PdfDoc[];
  observacao_auditor?: string;
  observacao_aprovador?: string;
  data_observacao?: any;
  ultima_sincronizacao?: any;
  data_conferencia?: any;
  data_retorno?: any;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TABS: { key: string; label: string; color: string }[] = [
  { key: 'PENDENTE',     label: 'Pendente',     color: 'text-amber-600 border-amber-500' },
  { key: 'CONFERIDA',    label: 'Conferida',    color: 'text-blue-600 border-blue-500' },
  { key: 'EM APROVAÇÃO', label: 'Em Aprovação', color: 'text-purple-600 border-purple-500' },
  { key: 'APROVADA',     label: 'Aprovada',     color: 'text-emerald-600 border-emerald-500' },
  { key: 'RETORNADA',    label: 'Retornada',    color: 'text-rose-600 border-rose-500' },
];

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  'PENDENTE':     { label: 'Pendente',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  'CONFERIDA':    { label: 'Conferida',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  'EM APROVAÇÃO': { label: 'Em Aprovação', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  'APROVADA':     { label: 'Aprovada',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  'RETORNADA':    { label: 'Retornada',    cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const SORT_OPTIONS = [
  { value: 'numero',      label: 'Número NF' },
  { value: 'fornecedor',  label: 'Fornecedor (A-Z)' },
  { value: 'data_desc',   label: 'Mais Recente' },
  { value: 'data_asc',    label: 'Mais Antiga' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function formatTs(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function tsNum(ts: any): number {
  if (!ts) return 0;
  try { return (ts.toDate ? ts.toDate() : new Date(ts)).getTime(); } catch { return 0; }
}

// ─── Modal de E-mail ──────────────────────────────────────────────────────────

interface EmailModalProps {
  notas: NF[];
  onClose: () => void;
  onEnviar: (tipo: 'aprovacao' | 'retorno', to: string, cc: string, obs: Record<string, string>) => Promise<void>;
  loading: boolean;
}

function EmailModal({ notas, onClose, onEnviar, loading }: EmailModalProps) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [obs, setObs] = useState<Record<string, string>>(() =>
    Object.fromEntries(notas.map(n => [n.id, n.observacao_auditor ?? '']))
  );

  useEffect(() => {
    getDoc(doc(db, 'app_config', 'recipients')).then(snap => {
      if (!snap.exists()) return;
      const lista: Recipient[] = snap.data().lista ?? [];
      const envio   = lista.filter(r => r.padrao_envio).map(r => r.email).join('; ');
      const retorno = lista.filter(r => r.padrao_retorno && !r.padrao_envio).map(r => r.email).join('; ');
      if (envio)   setTo(envio);
      if (retorno) setCc(retorno);
    }).catch(() => {});
  }, []);

  const submit = (tipo: 'aprovacao' | 'retorno') => {
    if (!to.trim()) { toast.error('Informe o destinatário (Para:)'); return; }
    onEnviar(tipo, to.trim(), cc.trim(), obs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Encaminhar Notas</h3>
              <p className="text-xs text-slate-500">{notas.length} nota(s) selecionada(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Para *</label>
              <input type="text" value={to} onChange={e => setTo(e.target.value)}
                placeholder="chefe@mail.intraer; outro@mail.intraer"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CC</label>
              <input type="text" value={cc} onChange={e => setCc(e.target.value)}
                placeholder="copia@mail.intraer"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observação por Nota</label>
            <div className="mt-2 space-y-2">
              {notas.map(nota => (
                <div key={nota.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-700">{nota.numero}</span>
                    <span className="text-xs text-slate-400 truncate max-w-[160px]">{nota.fornecedor}</span>
                  </div>
                  <textarea rows={2} value={obs[nota.id] ?? ''}
                    onChange={e => setObs(prev => ({ ...prev, [nota.id]: e.target.value }))}
                    placeholder="Observação desta nota..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-2">
          <button onClick={() => submit('retorno')} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl border border-rose-200 text-sm disabled:opacity-50">
            <RotateCcw size={15} /> Rascunho de Retorno
          </button>
          <button onClick={() => submit('aprovacao')} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl text-sm disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Enviar p/ Aprovação
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export function Invoices() {
  const { user } = useAuth();

  // ── Estado ────────────────────────────────────────────────────────────────
  const [invoices, setInvoices]           = useState<NF[]>([]);
  const [activeTab, setActiveTab]         = useState('PENDENTE');
  const [search, setSearch]              = useState('');
  const [sortKey, setSortKey]            = useState('numero');
  const [groupByFornec, setGroupByFornec] = useState(false);
  const [selectedIds, setSelectedIds]    = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId]        = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [obsText, setObsText]            = useState('');
  const [isSavingObs, setIsSavingObs]    = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isActing, setIsActing]          = useState(false);
  const [showSort, setShowSort]          = useState(false);

  const prevStatuses = useRef<Record<string, string>>({});
  const isAuditor   = user?.role === 'Auditor';
  const isAprovador = user?.role === 'Aprovador';
  const canAct      = isAuditor || isAprovador || !!user?.isAdmin;

  // ── Firestore real-time ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'notas_fiscais')), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NF[];

      data.forEach(nf => {
        const prev = prevStatuses.current[nf.id];
        if (prev && prev !== nf.status) {
          const cfg = STATUS_CFG[nf.status];
          toast(`${nf.numero} → ${cfg?.label ?? nf.status}`, {
            icon: nf.status === 'APROVADA' ? '✅' : nf.status === 'RETORNADA' ? '↩️' : '🔔',
            duration: 5000,
          });
        }
        prevStatuses.current[nf.id] = nf.status;
      });

      setInvoices(data);
    });
    return () => unsub();
  }, []);

  // ── Sincroniza obs do painel com a nota focada ───────────────────────────
  useEffect(() => {
    if (!focusedId) { setObsText(''); return; }
    const nf = invoices.find(n => n.id === focusedId);
    setObsText(nf?.observacao_auditor ?? '');
  }, [focusedId]);  // só ao mudar o foco, não quando invoices atualiza

  // ── Lista filtrada + ordenada ────────────────────────────────────────────
  const filteredList = useMemo(() => {
    let list = invoices.filter(nf => nf.status === activeTab);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(nf =>
        nf.numero.toLowerCase().includes(q) ||
        nf.fornecedor.toLowerCase().includes(q) ||
        (nf.contrato ?? '').toLowerCase().includes(q) ||
        (nf.cnpj ?? '').toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'fornecedor': return a.fornecedor.localeCompare(b.fornecedor);
        case 'data_desc':  return tsNum(b.ultima_sincronizacao) - tsNum(a.ultima_sincronizacao);
        case 'data_asc':   return tsNum(a.ultima_sincronizacao) - tsNum(b.ultima_sincronizacao);
        default:           return a.numero.localeCompare(b.numero);
      }
    });

    return list;
  }, [invoices, activeTab, search, sortKey]);

  // Agrupado por fornecedor (ou sem agrupamento)
  const groups = useMemo(() => {
    if (!groupByFornec) return [{ key: '__all__', label: null as string | null, items: filteredList }];
    const map: Record<string, NF[]> = {};
    for (const nf of filteredList) {
      if (!map[nf.fornecedor]) map[nf.fornecedor] = [];
      map[nf.fornecedor].push(nf);
    }
    return Object.entries(map).map(([k, items]) => ({ key: k, label: k, items }));
  }, [filteredList, groupByFornec]);

  const focusedNf = useMemo(
    () => invoices.find(n => n.id === focusedId) ?? null,
    [invoices, focusedId]
  );

  // ── Contagens por aba ────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const nf of invoices) c[nf.status] = (c[nf.status] ?? 0) + 1;
    return c;
  }, [invoices]);

  // ── Seleção múltipla (Ctrl, Shift) ──────────────────────────────────────
  const handleClick = useCallback((nf: NF, e: React.MouseEvent) => {
    const ids = filteredList.map(n => n.id);

    if (e.shiftKey && lastClickedId) {
      const a = ids.indexOf(lastClickedId);
      const b = ids.indexOf(nf.id);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const range = ids.slice(lo, hi + 1);
      setSelectedIds(prev => new Set([...prev, ...range]));
      setFocusedId(nf.id);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(nf.id) ? next.delete(nf.id) : next.add(nf.id);
        return next;
      });
      setLastClickedId(nf.id);
      setFocusedId(nf.id);
    } else {
      setSelectedIds(new Set([nf.id]));
      setLastClickedId(nf.id);
      setFocusedId(nf.id);
    }
  }, [filteredList, lastClickedId]);

  const toggleAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map(n => n.id)));
    }
  };

  const allSelected = filteredList.length > 0 && selectedIds.size === filteredList.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const selectedNfs = invoices.filter(n => selectedIds.has(n.id));

  // ── Salvar observação ────────────────────────────────────────────────────
  const saveObs = async () => {
    if (!focusedNf || obsText === (focusedNf.observacao_auditor ?? '')) return;
    setIsSavingObs(true);
    try {
      await updateDoc(doc(db, 'notas_fiscais', focusedNf.id), {
        observacao_auditor: obsText,
        data_observacao: serverTimestamp(),
      });
    } catch { toast.error('Erro ao salvar observação.'); }
    finally { setIsSavingObs(false); }
  };

  // ── Apagar notas (Auditor/Admin) ─────────────────────────────────────────
  const apagarSelecionadas = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Apagar ${ids.length} nota(s) do banco de dados? Esta ação não pode ser desfeita.`)) return;
    setIsActing(true);
    try {
      await Promise.all(ids.map(id => deleteDoc(doc(db, 'notas_fiscais', id))));
      toast.success(`${ids.length} nota(s) apagada(s).`);
      setSelectedIds(new Set());
      setFocusedId(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao apagar notas (verifique permissão).');
    } finally {
      setIsActing(false);
    }
  };

  // ── Mudar status ─────────────────────────────────────────────────────────
  const changeStatus = async (ids: string[], newStatus: string) => {
    setIsActing(true);
    const extra: Record<string, any> = {};
    if (newStatus === 'CONFERIDA') extra.data_conferencia = serverTimestamp();
    if (newStatus === 'RETORNADA') extra.data_retorno = serverTimestamp();

    try {
      await Promise.all(ids.map(id =>
        updateDoc(doc(db, 'notas_fiscais', id), { status: newStatus, ...extra })
      ));
      toast.success(`${ids.length} nota(s) → ${STATUS_CFG[newStatus]?.label ?? newStatus}`);
      setSelectedIds(new Set());
    } catch { toast.error('Erro ao atualizar status.'); }
    finally { setIsActing(false); }
  };

  // ── Retorno rápido no SILOMS ─────────────────────────────────────────────
  const retornarSiloms = async (nf: NF) => {
    const comentario = prompt(`Motivo do retorno de ${nf.numero}:`);
    if (!comentario?.trim()) return;
    setIsActing(true);
    const t = toast.loading('Enviando retorno ao SILOMS...');
    try {
      await addDoc(collection(db, 'command_queue'), {
        command: 'retornar_siloms', numero_nota: nf.numero, comentario,
        status: 'pending', createdAt: serverTimestamp(), uid: user?.uid, usuario: user?.username,
      });
      toast.success('Comando enviado!', { id: t });
    } catch { toast.error('Erro ao enviar.', { id: t }); }
    finally { setIsActing(false); }
  };

  // ── Envio de e-mail ──────────────────────────────────────────────────────
  const handleEnviar = async (
    tipo: 'aprovacao' | 'retorno', to: string, cc: string, obs: Record<string, string>
  ) => {
    setIsActing(true);
    const t = toast.loading(tipo === 'aprovacao' ? 'Enviando para aprovação...' : 'Salvando rascunho...');
    try {
      const notas = selectedNfs.map(n => ({
        numero: n.numero, fornecedor: n.fornecedor,
        contrato: n.contrato ?? 'N/A', observacao_auditor: obs[n.id] ?? '',
      }));
      await addDoc(collection(db, 'command_queue'), {
        command: tipo === 'aprovacao' ? 'enviar_aprovacao' : 'rascunho_retorno',
        dados: { notas, to, cc }, status: 'pending',
        createdAt: serverTimestamp(), uid: user?.uid, usuario: user?.username,
      });
      toast.success(tipo === 'aprovacao' ? 'Notas enviadas para aprovação!' : 'Rascunho salvo!', { id: t });
      setShowEmailModal(false);
      setSelectedIds(new Set());
    } catch { toast.error('Erro ao enviar comando.', { id: t }); }
    finally { setIsActing(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {showEmailModal && (
          <EmailModal notas={selectedNfs} onClose={() => setShowEmailModal(false)}
            onEnviar={handleEnviar} loading={isActing} />
        )}
      </AnimatePresence>

      <div className="flex flex-col h-[calc(100vh-7rem)] gap-0">

        {/* ── ABAS DE STATUS ────────────────────────────────────────────── */}
        <div className="flex items-end gap-1 px-1 border-b border-slate-200 bg-white shrink-0">
          {TABS.map(tab => {
            const cnt = counts[tab.key] ?? 0;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap',
                  active
                    ? cn('border-b-2', tab.color)
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                )}>
                {tab.label}
                {cnt > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                  )}>{cnt}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TOOLBAR ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-100 shrink-0">
          {/* Busca */}
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Buscar por NF, Fornecedor, Contrato..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none" />
          </div>

          {/* Sort */}
          <div className="relative">
            <button onClick={() => setShowSort(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium">
              <Filter size={13} />
              {SORT_OPTIONS.find(o => o.value === sortKey)?.label ?? 'Ordenar'}
              <ChevronDown size={13} className={cn('transition-transform', showSort && 'rotate-180')} />
            </button>
            {showSort && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                {SORT_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => { setSortKey(o.value); setShowSort(false); }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors',
                      sortKey === o.value ? 'font-bold text-brand-600' : 'text-slate-700'
                    )}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agrupar */}
          <button onClick={() => setGroupByFornec(p => !p)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors',
              groupByFornec
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            )}>
            <LayoutList size={13} /> Agrupar
          </button>

          <span className="ml-auto text-xs text-slate-400 font-mono">
            {filteredList.length} nota(s)
          </span>
        </div>

        {/* ── LAYOUT PRINCIPAL ──────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 gap-0">

          {/* ── LISTA DE NOTAS ──────────────────────────────────────────── */}
          <div className="w-[340px] shrink-0 border-r border-slate-200 flex flex-col bg-white">

            {/* Select All */}
            {canAct && filteredList.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
                <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-brand-600 transition-colors">
                  {allSelected
                    ? <CheckSquare size={15} className="text-brand-600" />
                    : someSelected
                      ? <CheckSquare size={15} className="text-slate-400" />
                      : <Square size={15} className="text-slate-400" />
                  }
                  {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
                {selectedIds.size > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                    {selectedIds.size}
                  </span>
                )}
              </div>
            )}

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {filteredList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <FileText size={32} className="opacity-20" />
                  <p className="text-sm">Nenhuma nota {activeTab.toLowerCase()}.</p>
                </div>
              ) : (
                groups.map(group => (
                  <div key={group.key}>
                    {group.label && (
                      <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                        {group.label}
                      </div>
                    )}
                    {group.items.map(nf => {
                      const isFocused  = focusedId === nf.id;
                      const isSelected = selectedIds.has(nf.id);
                      return (
                        <button key={nf.id}
                          onClick={e => handleClick(nf, e)}
                          className={cn(
                            'w-full text-left flex items-center gap-2.5 px-3 py-3 border-b border-slate-50 transition-colors group select-none',
                            isFocused  && 'bg-brand-50 border-l-2 border-l-brand-500',
                            isSelected && !isFocused && 'bg-blue-50/60',
                            !isFocused && !isSelected && 'hover:bg-slate-50'
                          )}>
                          {/* Checkbox */}
                          {canAct && (
                            <div className={cn(
                              'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                              isSelected ? 'bg-brand-600 border-brand-600' : 'border-slate-300 group-hover:border-brand-400'
                            )}>
                              {isSelected && <CheckCircle size={10} className="text-white" />}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate leading-tight">
                              {nf.numero}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5 leading-tight">
                              {nf.fornecedor}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <StatusBadge status={nf.status} />
                              {nf.valor_bruto && (
                                <span className="text-[10px] text-slate-400 font-mono">{nf.valor_bruto}</span>
                              )}
                              {(nf.documentos_pdf?.length ?? 0) > 0 && (
                                <span className="text-[10px] text-slate-400">· {nf.documentos_pdf!.length} PDF</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── PAINEL DE DETALHES ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            {!focusedNf ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <FileText size={32} className="opacity-30" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-500">Nenhuma nota selecionada</p>
                  <p className="text-sm mt-1">Clique em uma nota para ver os detalhes.</p>
                  <p className="text-xs mt-0.5 opacity-70">Use Ctrl + Click para selecionar múltiplas • Shift + Click para intervalo</p>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Header da nota */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start gap-4 justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900">{focusedNf.numero}</h2>
                        <StatusBadge status={focusedNf.status} />
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5 font-medium">{focusedNf.fornecedor}</p>
                    </div>

                    {/* Botões de status */}
                    {canAct && (
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        {focusedNf.status === 'PENDENTE' && (
                          <button disabled={isActing}
                            onClick={() => changeStatus([focusedNf.id], 'CONFERIDA')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            <CheckCircle size={13} /> Marcar Conferida
                          </button>
                        )}
                        {focusedNf.status === 'CONFERIDA' && (
                          <button disabled={isActing}
                            onClick={() => changeStatus([focusedNf.id], 'PENDENTE')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors">
                            Reverter para Pendente
                          </button>
                        )}
                        <button disabled={isActing}
                          onClick={() => retornarSiloms(focusedNf)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors">
                          <RotateCcw size={13} /> Retornar SILOMS
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Observação do Aprovador */}
                  {focusedNf.observacao_aprovador && (
                    <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-700">Observação do Aprovador</p>
                        <p className="text-xs text-amber-600 mt-0.5">{focusedNf.observacao_aprovador}</p>
                      </div>
                    </div>
                  )}

                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {[
                      { label: 'Valor',    value: focusedNf.valor_bruto ?? '—' },
                      { label: 'Contrato', value: focusedNf.contrato ?? '—' },
                      { label: 'CNPJ',     value: focusedNf.cnpj ?? '—' },
                      { label: 'Sincronizado', value: formatTs(focusedNf.ultima_sincronizacao) },
                      ...(focusedNf.data_conferencia
                        ? [{ label: 'Conferida em', value: formatTs(focusedNf.data_conferencia) }]
                        : []),
                      ...(focusedNf.data_retorno
                        ? [{ label: 'Retornada em', value: formatTs(focusedNf.data_retorno) }]
                        : []),
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                        <p className="text-sm font-semibold text-slate-700 mt-0.5 break-all">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PDFs */}
                {(focusedNf.documentos_pdf?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <File size={15} className="text-slate-400" />
                        Documentos ({focusedNf.documentos_pdf!.length})
                      </h3>
                      <button
                        onClick={() => {
                          const pdfs = focusedNf.documentos_pdf ?? [];
                          if (!pdfs.length) { toast.error('Nenhum PDF.'); return; }
                          pdfs.forEach(p => window.open(p.url, '_blank', 'noopener'));
                          toast.success(`${pdfs.length} PDF(s) aberto(s).`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors">
                        <Layers size={12} /> Abrir Todos
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {focusedNf.documentos_pdf!.map((pdf, i) => (
                        <button key={i}
                          onClick={() => window.open(pdf.url, '_blank', 'noopener')}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-colors max-w-[220px]">
                          <File size={12} className="shrink-0 text-slate-400" />
                          <span className="truncate">{pdf.nome}</span>
                          <ExternalLink size={10} className="shrink-0 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observação do Auditor */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      <FileText size={15} className="text-slate-400" />
                      Observação do Auditor
                    </h3>
                    <div className="flex items-center gap-2">
                      {focusedNf.data_observacao && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> {formatTs(focusedNf.data_observacao)}
                        </span>
                      )}
                      {isSavingObs && <Loader2 size={12} className="animate-spin text-slate-400" />}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    disabled={!canAct}
                    value={obsText}
                    onChange={e => setObsText(e.target.value)}
                    onBlur={saveObs}
                    placeholder={canAct ? 'Digite a observação desta nota... (salvo automaticamente ao sair do campo)' : 'Sem observação.'}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  />
                  {canAct && (
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                      <Save size={9} /> Salvo automaticamente ao sair do campo
                    </p>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── BARRA DE AÇÕES FLUTUANTE ──────────────────────────────────── */}
        <AnimatePresence>
          {selectedIds.size > 0 && canAct && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl shadow-slate-900/30 border border-slate-700"
            >
              <span className="text-sm font-bold mr-1">{selectedIds.size} nota(s)</span>

              {activeTab === 'PENDENTE' && (
                <button disabled={isActing}
                  onClick={() => changeStatus([...selectedIds], 'CONFERIDA')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">
                  <CheckCircle size={13} /> Marcar Conferida
                </button>
              )}

              {activeTab === 'CONFERIDA' && (
                <button disabled={isActing}
                  onClick={() => { if (selectedIds.size > 0) setShowEmailModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">
                  <Send size={13} /> Enviar p/ Aprovação
                </button>
              )}

              <button disabled={isActing}
                onClick={() => setShowEmailModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">
                <Mail size={13} /> E-mail
              </button>

              <button disabled={isActing}
                onClick={() => changeStatus([...selectedIds], 'RETORNADA')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">
                <RotateCcw size={13} /> Marcar Retornada
              </button>

              {(isAuditor || user?.isAdmin) && (
                <button disabled={isActing}
                  onClick={apagarSelecionadas}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors">
                  <Trash2 size={13} /> Apagar
                </button>
              )}

              <div className="w-px h-5 bg-slate-700 mx-1" />

              <button onClick={() => setSelectedIds(new Set())}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clique fora do dropdown de sort fecha */}
        {showSort && (
          <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
        )}
      </div>
    </>
  );
}
