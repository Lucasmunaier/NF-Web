import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth, UserProfile } from '../context/AuthContext';
import { Users, ShieldAlert, Check, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export function UserAdmin() {
  const { user } = useAuth();
  const [usersList, setUsersList] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // doc.id agora é o username; uid dentro do documento é o Firebase Auth UID atual
      const usersData = snapshot.docs.map(d => ({
        ...d.data(),
        // garante que username === doc.id (chave persistente)
        username: d.id,
      })) as UserProfile[];
      setUsersList(usersData);
    }, (error) => {
      console.error("Erro ao listar usuários (Permissão):", error);
    });
    return () => unsubscribe();
  }, []);

  // Usa username como chave do documento (não o uid do Firebase Auth)
  const handleRoleChange = async (username: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', username), { role: newRole });
      toast.success('Perfil operacional atualizado!');
    } catch (error) {
      toast.error('Erro ao atualizar perfil.');
    }
  };

  const handleAdminToggle = async (username: string, currentAdminStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', username), { isAdmin: !currentAdminStatus });
      toast.success(currentAdminStatus ? 'Privilégio de Admin removido.' : 'Privilégio de Admin concedido!');
    } catch (error) {
      toast.error('Erro ao atualizar privilégios.');
    }
  };

  // Proteção: AGORA BLOQUEIA SE NÃO FOR ADMIN (Independente de ser Aprovador ou Auditor)
  if (!user?.isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
        <ShieldAlert size={48} className="text-rose-500 opacity-50" />
        <h2 className="text-xl font-bold text-slate-800">Acesso Negado</h2>
        <p>Você não tem privilégios de Administrador do Sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users size={24} /> Gerenciamento de Equipe e Permissões
        </h1>
        <p className="text-slate-500">Controle a operação (Auditor/Aprovador) e quem administra o sistema.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4 font-bold">Usuário (SILOMS)</th>
              <th className="px-6 py-4 font-bold">Cargo Operacional</th>
              <th className="px-6 py-4 font-bold text-center">É Administrador?</th>
              <th className="px-6 py-4 font-bold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usersList.map((u) => (
              <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-800">
                  {u.username}
                  {u.isAdmin && <Shield size={14} className="inline ml-2 text-brand-500" title="Administrador" />}
                </td>
                <td className="px-6 py-4">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.username, e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block w-full p-2 outline-none"
                  >
                    <option value="Visualizador">Visualizador (Somente Leitura)</option>
                    <option value="Auditor">Auditor (Pode Retornar)</option>
                    <option value="Aprovador">Aprovador (Acesso Total)</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={!!u.isAdmin}
                      onChange={() => handleAdminToggle(u.username, !!u.isAdmin)}
                      disabled={u.username === user.username} // Evita remover o próprio admin
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                  </label>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-xs font-bold">
                    <Check size={12} /> Ativo
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}