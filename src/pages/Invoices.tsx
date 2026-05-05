import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, RotateCcw, CheckCircle, Search, ChevronRight, File } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';

// Tipagem básica esperada do Firebase
interface PdfDoc {
  nome: string;
  url: string;
}

interface Invoice {
  id: string; // ID do documento no Firestore
  numero: string;
  fornecedor: string;
  valor: number | string;
  status: string;
  documentos_pdf?: PdfDoc[];
}

export function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [isCommandLoading, setIsCommandLoading] = useState(false);

  // 1. Escuta as notas fiscais em tempo real
  useEffect(() => {
    const q = query(collection(db, 'notas_fiscais'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      
      setInvoices(notesData);
      
      // Atualiza a nota selecionada caso haja mudança nos dados (ex: novos PDFs)
      if (selectedInvoice) {
        const updated = notesData.find(n => n.id === selectedInvoice.id);
        if (updated) setSelectedInvoice(updated);
      }
    });

    return () => unsubscribe();
  }, [selectedInvoice]);

  // 2. Dispara comandos para o Python
  const handleCommand = async (command: 'retornar_nota' | 'avancar_nota') => {
    if (!selectedInvoice) return;
    
    // Simples input de comentário (em produção pode ser um Modal de verdade)
    const comentario = command === 'retornar_nota' 
      ? prompt("Motivo do retorno:") 
      : prompt("Observação para aprovação (opcional):");

    if (command === 'retornar_nota' && !comentario) {
      toast.error('O motivo do retorno é obrigatório.');
      return;
    }

    setIsCommandLoading(true);
    const loadingToast = toast.loading('Enviando comando para o servidor interno...');

    try {
      await addDoc(collection(db, 'command_queue'), {
        command,
        id_nota: selectedInvoice.id,
        numero_nota: selectedInvoice.numero,
        comentario: comentario || '',
        status: 'pending',
        createdAt: serverTimestamp(),
        uid: user?.uid,
        usuario: user?.username
      });

      toast.success('Comando enviado com sucesso!', { id: loadingToast });
      
      // Limpa a seleção para o usuário saber que a ação foi despachada
      setSelectedInvoice(null);
      setSelectedPdfUrl(null);
      
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar comando.', { id: loadingToast });
    } finally {
      setIsCommandLoading(false);
    }
  };

  // 3. Filtra e Agrupa por Fornecedor
  const filteredInvoices = invoices.filter(inv => 
    inv.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.fornecedor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedInvoices = filteredInvoices.reduce((acc, curr) => {
    if (!acc[curr.fornecedor]) acc[curr.fornecedor] = [];
    acc[curr.fornecedor].push(curr);
    return acc;
  }, {} as Record<string, Invoice[]>);

  // Seleciona o primeiro PDF por padrão ao clicar numa nota
  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    if (invoice.documentos_pdf && invoice.documentos_pdf.length > 0) {
      setSelectedPdfUrl(invoice.documentos_pdf[0].url);
    } else {
      setSelectedPdfUrl(null);
    }
  };

  return (
    <div className="h-[calc(100vh-100px)] flex gap-6">
      
      {/* PAINEL LATERAL: Lista de Notas Agrupadas */}
      <div className="w-1/3 bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
            <FileText size={18} /> Notas para Análise
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Filtrar NF ou Fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(groupedInvoices).map(([fornecedor, notas]: [string, Invoice[]]) => (
            <div key={fornecedor} className="mb-4">
              <div className="px-2 py-1 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 bg-white z-10 border-b border-slate-100 mb-2">
                {fornecedor}
              </div>
              <div className="space-y-1">
                {notas.map(nota => (
                  <button
                    key={nota.id}
                    onClick={() => handleSelectInvoice(nota)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors border",
                      selectedInvoice?.id === nota.id 
                        ? "bg-brand-50 border-brand-200 text-brand-700" 
                        : "bg-white border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div>
                      <div className="font-bold text-sm">{nota.numero}</div>
                      <div className="text-xs opacity-70">
                        {nota.documentos_pdf?.length || 0} PDF(s) anexados
                      </div>
                    </div>
                    <ChevronRight size={16} className={selectedInvoice?.id === nota.id ? "text-brand-500" : "text-slate-300"} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(groupedInvoices).length === 0 && (
            <div className="text-center text-slate-400 text-sm mt-10">Nenhuma nota encontrada.</div>
          )}
        </div>
      </div>

      {/* ÁREA PRINCIPAL: Visualizador de PDF e Ações */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
        {selectedInvoice ? (
          <>
            {/* Cabeçalho da Nota Selecionada */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-800">{selectedInvoice.numero}</h3>
                <p className="text-sm text-slate-500">{selectedInvoice.fornecedor}</p>
              </div>

              {/* Botões de Ação (Aparecem baseados no perfil se necessário) */}
              <div className="flex gap-2">
                <button 
                  onClick={() => handleCommand('retornar_nota')}
                  disabled={isCommandLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-lg transition-colors border border-rose-200 disabled:opacity-50 text-sm"
                >
                  <RotateCcw size={16} /> Retornar
                </button>

                {(user?.role === 'Auditor' || user?.role === 'Aprovador') && (
                  <button 
                    onClick={() => handleCommand('avancar_nota')}
                    disabled={isCommandLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white hover:bg-brand-700 font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 text-sm"
                  >
                    <CheckCircle size={16} /> Aprovar / Avançar
                  </button>
                )}
              </div>
            </div>

            {/* Menu de PDFs da Nota */}
            {selectedInvoice.documentos_pdf && selectedInvoice.documentos_pdf.length > 0 && (
              <div className="flex px-4 py-2 gap-2 border-b border-slate-100 overflow-x-auto bg-white">
                {selectedInvoice.documentos_pdf.map((pdf, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedPdfUrl(pdf.url)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border",
                      selectedPdfUrl === pdf.url
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                    )}
                  >
                    <File size={14} />
                    {pdf.nome}
                  </button>
                ))}
              </div>
            )}

            {/* Visualizador de PDF */}
            <div className="flex-1 bg-slate-200 p-2">
              {selectedPdfUrl ? (
                <iframe 
                  src={`${selectedPdfUrl}#toolbar=0&navpanes=0`} 
                  className="w-full h-full rounded-lg shadow-sm bg-white"
                  title="PDF Viewer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 flex-col gap-3">
                  <FileText size={48} className="opacity-20" />
                  <p>Nenhum PDF atrelado a esta nota fiscal.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
              <FileText size={32} className="text-slate-300" />
            </div>
            <p>Selecione uma nota fiscal na lista lateral para iniciar a análise.</p>
          </div>
        )}
      </div>
    </div>
  );
}