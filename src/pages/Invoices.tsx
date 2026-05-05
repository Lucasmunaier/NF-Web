import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import type { Recipient } from './Settings';
import { useAuth } from '../context/AuthContext';
import {
  FileText, RotateCcw, CheckCircle, Search, ChevronRight,
  File, ExternalLink, Send, Mail, X, Layers, Bell, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PdfDoc {
  nome: string;
  url: string;
}

interface Invoice {
  id: string;
  numero: string;
  fornecedor: string;
  valor: number | string;
  status: string;
  contrato?: string;
  cnpj?: string;
  documentos_pdf?: PdfDoc[];
  observacao_auditor?: string;
  observacao_aprovador?: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  'PENDENTE':        { label: 'Pendente',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  'CONFERIDA':       { label: 'Conferida',      cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  'EM APROVAÇÃO':    { label: 'Em Aprovação',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  'APROVADA':        { label: 'Aprovada',       cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  'RETORNADA':       { label: 'Retornada',      cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── Modal de E-mail ──────────────────────────────────────────────────────────

interface EmailModalProps {
  notas: Invoice[];
  onClose: () => void;
  onEnviar: (tipo: 'aprovacao' | 'retorno', to: string, cc: string, obs: Record<string, string>) => Promise<void>;
  loading: boolean;
}

function EmailModal({ notas, onClose, onEnviar, loading }: EmailModalProps) {
  const [to, setTo]   = useState('');
  const [cc, setCc]   = useState('');
  const [obs, setObs] = useState<Record<string, string>>(() =>
    Object.fromEntries(notas.map(n => [n.id, n.observacao_auditor ?? '']))
  );

  // Pre-popula Para/CC com destinatários salvos nas configurações
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

  const handleSubmit = (tipo: 'aprovacao' | 'retorno') => {
    if (!to.trim()) { toast.error('Informe o destinatário (Para:)'); return; }
    onEnviar(tipo, to.trim(), cc.trim(), obs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Encaminhar Notas</h3>
              <p className="text-xs text-slate-500">{notas.length} nota(s) selecionada(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Destinatários */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Para *</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="chefe@mail.intraer; outro@mail.intraer"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">CC (opcional)</label>
              <input
                type="email"
                value={cc}
                onChange={e => setCc(e.target.value)}
                placeholder="copia@mail.intraer"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Observação por nota */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Observações por Nota
            </label>
            <div className="mt-2 space-y-3">
              {notas.map(nota => (
                <div key={nota.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-700">{nota.numero}</span>
                    <span className="text-xs text-slate-400">{nota.fornecedor}</span>
                  </div>
                  <textarea
                    rows={2}
                    value={obs[nota.id] ?? ''}
                    onChange={e => setObs(prev => ({ ...prev, [nota.id]: e.target.value }))}
                    placeholder="Observação desta nota (ex: conferida, com pendência de...)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Botões de ação */}
        <div className="p-5 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => handleSubmit('retorno')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl border border-rose-200 transition-colors text-sm disabled:opacity-50"
          >
            <RotateCcw size={15} />
            Salvar Rascunho de Retorno
          </button>
          <button
            onClick={() => handleSubmit('aprovacao')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl shadow-sm transition-colors text-sm disabled:opacity-50"
          >
            <Send size={15} />
            Enviar para Aprovação
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices]             = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm]         = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [checkedIds, setCheckedIds]         = useState<Set<string>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isLoading, setIsLoading]           = useState(false);

  // Rastreia status anteriores para notificações
  const prevStatuses = useRef<Record<string, string>>({});

  const isAuditor   = user?.role === 'Auditor';
  const isAprovador = user?.role === 'Aprovador';
  const canAct      = isAuditor || isAprovador;

  // ── 1. Escuta notas em tempo real + notificações de mudança de status ───────
  useEffect(() => {
    const q = query(collection(db, 'notas_fiscais'));
    const unsubscribe = onSnapshot(q, snapshot => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Invoice[];

      // Notificações de mudança de status
      notesData.forEach(nota => {
        const prev = prevStatuses.current[nota.id];
        if (prev && prev !== nota.status) {
          const cfg = STATUS_CONFIG[nota.status];
          toast(
            `${nota.numero} → ${cfg?.label ?? nota.status}`,
            {
              icon: nota.status === 'APROVADA' ? '✅'
                  : nota.status === 'RETORNADA' ? '↩️'
                  : nota.status === 'EM APROVAÇÃO' ? '📤'
                  : '🔔',
              duration: 5000,
            }
          );
        }
        prevStatuses.current[nota.id] = nota.status;
      });

      setInvoices(notesData);

      // Mantém nota selecionada atualizada
      if (selectedInvoice) {
        const updated = notesData.find(n => n.id === selectedInvoice.id);
        if (updated) setSelectedInvoice(updated);
      }
    });
    return () => unsubscribe();
  }, [selectedInvoice]);

  // ── 2. Helpers de seleção ────────────────────────────────────────────────────
  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const checkedInvoices = invoices.filter(n => checkedIds.has(n.id));

  // ── 3. Abrir PDFs em nova aba ────────────────────────────────────────────────
  const abrirPdf = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  const abrirTodosPdfs = () => {
    const pdfs = selectedInvoice?.documentos_pdf ?? [];
    if (!pdfs.length) { toast.error('Nenhum PDF disponível.'); return; }
    pdfs.forEach(pdf => abrirPdf(pdf.url));
    toast.success(`${pdfs.length} PDF(s) aberto(s) em novas abas.`);
  };

  // ── 4. Envio de e-mail / rascunho ────────────────────────────────────────────
  const handleEnviar = async (
    tipo: 'aprovacao' | 'retorno',
    to: string,
    cc: string,
    obs: Record<string, string>
  ) => {
    setIsLoading(true);
    const loadingToast = toast.loading(
      tipo === 'aprovacao' ? 'Enviando para aprovação...' : 'Salvando rascunho...'
    );
    try {
      const notasPayload = checkedInvoices.map(n => ({
        numero:            n.numero,
        fornecedor:        n.fornecedor,
        contrato:          n.contrato ?? 'N/A',
        observacao_auditor: obs[n.id] ?? '',
      }));

      await addDoc(collection(db, 'command_queue'), {
        command:   tipo === 'aprovacao' ? 'enviar_aprovacao' : 'rascunho_retorno',
        dados:     { notas: notasPayload, to, cc },
        status:    'pending',
        createdAt: serverTimestamp(),
        uid:       user?.uid,
        usuario:   user?.username,
      });

      toast.success(
        tipo === 'aprovacao' ? 'Notas enviadas para aprovação!' : 'Rascunho salvo em Drafts!',
        { id: loadingToast }
      );
      setShowEmailModal(false);
      setCheckedIds(new Set());
    } catch {
      toast.error('Erro ao enviar comando.', { id: loadingToast });
    } finally {
      setIsLoading(false);
    }
  };

  // ── 5. Retorno rápido (nota única) ───────────────────────────────────────────
  const handleRetornoRapido = async () => {
    if (!selectedInvoice) return;
    const comentario = prompt('Motivo do retorno:');
    if (!comentario?.trim()) { toast.error('O motivo é obrigatório.'); return; }

    setIsLoading(true);
    const t = toast.loading('Enviando comando de retorno...');
    try {
      await addDoc(collection(db, 'command_queue'), {
        command:    'retornar_siloms',
        numero_nota: selectedInvoice.numero,
        comentario,
        status:     'pending',
        createdAt:  serverTimestamp(),
        uid:        user?.uid,
        usuario:    user?.username,
      });
      toast.success('Retorno enviado ao SILOMS!', { id: t });
      setSelectedInvoice(null);
    } catch {
      toast.error('Erro ao enviar.', { id: t });
    } finally {
      setIsLoading(false);
    }
  };

  // ── 6. Filtragem e agrupamento ────────────────────────────────────────────────
  const filtered = invoices.filter(inv =>
    inv.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.fornecedor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filtered.reduce((acc, curr) => {
    if (!acc[curr.fornecedor]) acc[curr.fornecedor] = [];
    acc[curr.fornecedor].push(curr);
    return acc;
  }, {} as Record<string, Invoice[]>);

  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setSelectedPdfUrl(invoice.documentos_pdf?.[0]?.url ?? null);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modal de e-mail */}
      <AnimatePresence>
        {showEmailModal && (
          <EmailModal
            notas={checkedInvoices}
            onClose={() => setShowEmailModal(false)}
            onEnviar={handleEnviar}
            loading={isLoading}
          />
        )}
      </AnimatePresence>

      <div className="h-[calc(100vh-100px)] flex flex-col gap-4">

        {/* Barra de ações para notas marcadas */}
        <AnimatePresence>
          {checkedIds.size > 0 && canAct && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-xl shadow-lg"
            >
              <Bell size={16} />
              <span className="text-sm font-bold flex-1">
                {checkedIds.size} nota(s) selecionada(s)
              </span>
              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50"
              >
                <Mail size={14} /> Encaminhar
              </button>
              <button
                onClick={() => setCheckedIds(new Set())}
                className="p-1.5 hover:bg-blue-700 rounded-lg"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Layout principal */}
        <div className="flex-1 flex gap-6 min-h-0">

          {/* ── PAINEL LATERAL ────────────────────────────────────────────── */}
          <div className="w-80 bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden shrink-0">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                <FileText size={18} /> Notas Fiscais
                <span className="ml-auto text-xs font-normal text-slate-400">{invoices.length} total</span>
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Filtrar por NF ou Fornecedor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {Object.entries(grouped).length === 0 ? (
                <div className="text-center text-slate-400 text-sm mt-10 px-4">
                  <FileText size={32} className="mx-auto mb-2 opacity-20" />
                  Nenhuma nota encontrada.
                </div>
              ) : (
                Object.entries(grouped).map(([fornecedor, notas]) => (
                  <div key={fornecedor} className="mb-4">
                    <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 bg-white z-10 border-b border-slate-100 mb-1">
                      {fornecedor}
                    </div>
                    <div className="space-y-1">
                      {notas.map(nota => (
                        <button
                          key={nota.id}
                          onClick={() => handleSelectInvoice(nota)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 transition-colors border group',
                            selectedInvoice?.id === nota.id
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          {/* Checkbox — só aparece para Auditor/Aprovador */}
                          {canAct && (
                            <div
                              onClick={e => toggleCheck(nota.id, e)}
                              className={cn(
                                'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center cursor-pointer transition-colors',
                                checkedIds.has(nota.id)
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-slate-300 group-hover:border-blue-400'
                              )}
                            >
                              {checkedIds.has(nota.id) && (
                                <CheckCircle size={10} className="text-white" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate">{nota.numero}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusBadge status={nota.status} />
                              <span className="text-[10px] text-slate-400">
                                {nota.documentos_pdf?.length ?? 0} PDF(s)
                              </span>
                            </div>
                          </div>
                          <ChevronRight
                            size={14}
                            className={selectedInvoice?.id === nota.id ? 'text-blue-400' : 'text-slate-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── ÁREA PRINCIPAL ────────────────────────────────────────────── */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden min-w-0">
            {selectedInvoice ? (
              <>
                {/* Cabeçalho da nota */}
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-slate-800">{selectedInvoice.numero}</h3>
                        <StatusBadge status={selectedInvoice.status} />
                      </div>
                      <p className="text-sm text-slate-500">{selectedInvoice.fornecedor}</p>
                      {selectedInvoice.contrato && selectedInvoice.contrato !== 'N/A' && (
                        <p className="text-xs text-slate-400 mt-0.5">Contrato: {selectedInvoice.contrato}</p>
                      )}
                      {selectedInvoice.observacao_aprovador && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                          <span><b>Obs. do Chefe:</b> {selectedInvoice.observacao_aprovador}</span>
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    {canAct && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={handleRetornoRapido}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-lg border border-rose-200 text-sm disabled:opacity-50"
                        >
                          <RotateCcw size={14} /> Retornar SILOMS
                        </button>
                        <button
                          onClick={() => {
                            if (!checkedIds.has(selectedInvoice.id)) {
                              setCheckedIds(prev => new Set([...prev, selectedInvoice.id]));
                            }
                            setShowEmailModal(true);
                          }}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-lg shadow-sm text-sm disabled:opacity-50"
                        >
                          <Send size={14} /> Encaminhar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Abas de PDF */}
                {selectedInvoice.documentos_pdf && selectedInvoice.documentos_pdf.length > 0 && (
                  <div className="flex items-center px-4 py-2 gap-2 border-b border-slate-100 bg-white overflow-x-auto">
                    <div className="flex gap-1.5 flex-1 overflow-x-auto">
                      {selectedInvoice.documentos_pdf.map((pdf, i) => (
                        <div key={i} className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setSelectedPdfUrl(pdf.url)}
                            className={cn(
                              'flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-l-full text-xs font-bold whitespace-nowrap border transition-colors',
                              selectedPdfUrl === pdf.url
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            )}
                          >
                            <File size={12} /> {pdf.nome}
                          </button>
                          {/* Botão abrir em nova aba */}
                          <button
                            onClick={() => abrirPdf(pdf.url)}
                            title="Abrir em nova aba"
                            className={cn(
                              'flex items-center justify-center px-2 py-1.5 rounded-r-full text-xs border-y border-r transition-colors',
                              selectedPdfUrl === pdf.url
                                ? 'bg-slate-700 text-slate-300 border-slate-700 hover:bg-slate-600'
                                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 hover:text-slate-700'
                            )}
                          >
                            <ExternalLink size={11} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Botão abrir todos */}
                    <button
                      onClick={abrirTodosPdfs}
                      title="Abrir todos os PDFs em novas abas"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-full text-xs font-bold hover:bg-slate-700 transition-colors"
                    >
                      <Layers size={12} /> Abrir todos
                    </button>
                  </div>
                )}

                {/* Visualizador de PDF */}
                <div className="flex-1 bg-slate-100 p-2 min-h-0">
                  {selectedPdfUrl ? (
                    <iframe
                      src={`${selectedPdfUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-full rounded-lg shadow-sm bg-white"
                      title="Visualizador de PDF"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 flex-col gap-3">
                      <FileText size={40} className="opacity-20" />
                      <p className="text-sm">Nenhum PDF anexado a esta nota.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                  <FileText size={32} className="text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-slate-500">Nenhuma nota selecionada</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Clique em uma nota na lista para visualizar os documentos.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
