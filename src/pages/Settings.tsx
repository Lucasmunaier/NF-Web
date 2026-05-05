import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Mail, User, Eye, EyeOff, Save, Plus, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface EmailSettings {
  email: string;
  password: string;
  assinatura_nome: string;
  assinatura_funcao: string;
  assinatura_ramal: string;
}

export interface Recipient {
  email: string;
  padrao_envio: boolean;
  padrao_retorno: boolean;
}

const EMPTY_SETTINGS: EmailSettings = {
  email: '', password: '', assinatura_nome: '', assinatura_funcao: '', assinatura_ramal: '',
};

export function Settings() {
  const [cfg, setCfg]                 = useState<EmailSettings>(EMPTY_SETTINGS);
  const [recipients, setRecipients]   = useState<Recipient[]>([]);
  const [newEmail, setNewEmail]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [isLoading, setIsLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [emailSnap, recipSnap] = await Promise.all([
          getDoc(doc(db, 'app_config', 'email_settings')),
          getDoc(doc(db, 'app_config', 'recipients')),
        ]);
        if (emailSnap.exists()) setCfg({ ...EMPTY_SETTINGS, ...(emailSnap.data() as EmailSettings) });
        if (recipSnap.exists()) setRecipients(recipSnap.data().lista ?? []);
      } catch {
        toast.error('Erro ao carregar configurações do Firebase.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        setDoc(doc(db, 'app_config', 'email_settings'), cfg),
        setDoc(doc(db, 'app_config', 'recipients'), { lista: recipients }),
      ]);
      toast.success('Configurações salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar. Verifique as permissões do Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (recipients.some(r => r.email === email)) {
      toast.error('Este e-mail já está na lista.');
      return;
    }
    setRecipients(prev => [...prev, { email, padrao_envio: false, padrao_retorno: false }]);
    setNewEmail('');
  };

  const toggle = (idx: number, field: 'padrao_envio' | 'padrao_retorno') =>
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: !r[field] } : r));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={32} />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações do Sistema</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Configure o remetente Zimbra e os destinatários padrão. Salvo no Firebase — o worker lê automaticamente.
        </p>
      </div>

      {/* ─── Credenciais do Remetente ─────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <SectionHeader
          icon={<Mail size={18} className="text-brand-600" />}
          bg="bg-brand-50"
          title="1. Credenciais do Remetente"
          subtitle="Conta Zimbra usada para enviar e-mails (smtp.mail.intraer)."
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="E-mail do Remetente" className="sm:col-span-2">
            <input
              type="text"
              value={cfg.email}
              onChange={e => setCfg(p => ({ ...p, email: e.target.value }))}
              className={inputCls}
              placeholder="seuemail@mail.intraer"
            />
          </Field>

          <Field label="Senha">
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={cfg.password}
                onChange={e => setCfg(p => ({ ...p, password: e.target.value }))}
                className={inputCls + ' pr-10'}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <User size={13} /> 2. Assinatura do E-mail
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Posto/Grad + Nome de Guerra">
              <input type="text" value={cfg.assinatura_nome}
                onChange={e => setCfg(p => ({ ...p, assinatura_nome: e.target.value }))}
                className={inputCls} placeholder="Ex: 3S Fulano de Tal" />
            </Field>
            <Field label="Função + Setor">
              <input type="text" value={cfg.assinatura_funcao}
                onChange={e => setCfg(p => ({ ...p, assinatura_funcao: e.target.value }))}
                className={inputCls} placeholder="Ex: Auxiliar da Seção de Controle - SEALC" />
            </Field>
            <Field label="Ramal">
              <input type="text" value={cfg.assinatura_ramal}
                onChange={e => setCfg(p => ({ ...p, assinatura_ramal: e.target.value }))}
                className={inputCls} placeholder="Ex: Ramal: 1234" />
            </Field>
          </div>
        </div>
      </section>

      {/* ─── Destinatários ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <SectionHeader
          icon={<Mail size={18} className="text-emerald-600" />}
          bg="bg-emerald-50"
          title="3. Lista de Destinatários"
          subtitle='Define os e-mails padrão para "Envio p/ Aprovação" e "Rascunho de Retorno".'
        />

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">E-mail</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Padrão Envio</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Padrão Retorno</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                    Nenhum destinatário cadastrado.
                  </td>
                </tr>
              )}
              {recipients.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 break-all">{r.email}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={r.padrao_envio}
                      onChange={() => toggle(i, 'padrao_envio')}
                      className="w-4 h-4 accent-brand-600 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={r.padrao_retorno}
                      onChange={() => toggle(i, 'padrao_retorno')}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setRecipients(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRecipient()}
            className={inputCls + ' flex-1'}
            placeholder='"CL Erasmo, PAMA-LS" <erasmojelj@fab.mil.br>'
          />
          <button
            onClick={addRecipient}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>
      </section>

      {/* ─── Botão Salvar ─────────────────────────────────────────── */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-brand-200 transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm ' +
  'focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({
  icon, bg, title, subtitle,
}: { icon: React.ReactNode; bg: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
      <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}
