import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc, serverTimestamp } from 'firebase/firestore';

// Tipagem do usuário logado
export interface UserProfile {
  uid: string;       // Firebase Auth UID da sessão atual (muda a cada login anônimo)
  username: string;  // CPF / login SILOMS — chave persistente do perfil no Firestore
  role: 'Auditor' | 'Aprovador' | 'Visualizador';
  isAdmin?: boolean;
  passwordHash?: string;
  salt?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, setStatus?: (msg: string) => void) => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Helpers de hash (SHA-256 + salt) ─────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Salva/atualiza perfil em users/{username} e cria uid_map/{uid}→username. */
async function persistProfile(uid: string, profile: UserProfile): Promise<void> {
  // uid_map deve existir ANTES de users para as regras do Firestore funcionarem
  await setDoc(doc(db, 'uid_map', uid), { username: profile.username });
  await setDoc(doc(db, 'users', profile.username), { ...profile, uid });
}

/** Resolve o perfil a partir de um UID do Firebase Auth. */
async function resolveProfile(uid: string): Promise<UserProfile | null> {
  // 1. Tenta o novo modelo: uid_map → users/{username}
  const mapSnap = await getDoc(doc(db, 'uid_map', uid));
  if (mapSnap.exists()) {
    const { username } = mapSnap.data() as { username: string };
    const profSnap = await getDoc(doc(db, 'users', username));
    if (profSnap.exists()) return { ...profSnap.data() as UserProfile, uid };
  }

  // 2. Fallback: modelo antigo users/{uid} (migração automática)
  const oldSnap = await getDoc(doc(db, 'users', uid));
  if (oldSnap.exists()) {
    const profile = oldSnap.data() as UserProfile;
    // Migra para o novo modelo silenciosamente
    await persistProfile(uid, profile);
    return profile;
  }

  return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await resolveProfile(firebaseUser.uid);
          setUser(profile);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (
    username: string,
    password: string,
    setStatus?: (msg: string) => void
  ): Promise<UserProfile | null> => {
    const emit = (msg: string) => setStatus?.(msg);

    try {
      // ── Admin local (sem SILOMS) ─────────────────────────────────────────
      if (username === 'Admin' && password === '159602') {
        emit('Autenticando administrador...');
        const { user: fbUser } = await signInAnonymously(auth);
        const uid = fbUser.uid;

        // uid_map deve existir antes de acessar users/Admin (exigido pelas regras)
        await setDoc(doc(db, 'uid_map', uid), { username: 'Admin' });

        // Carrega perfil existente do Admin (preserva alterações feitas no painel)
        const existingSnap = await getDoc(doc(db, 'users', 'Admin'));
        const adminProfile: UserProfile = existingSnap.exists()
          ? { ...existingSnap.data() as UserProfile, uid }
          : { uid, username: 'Admin', role: 'Auditor', isAdmin: true };

        await persistProfile(uid, adminProfile);
        setUser(adminProfile);
        emit('Acesso administrativo concedido!');
        return adminProfile;
      }

      // ── Login SILOMS — entra com Firebase Anônimo primeiro ──────────────
      emit('Conectando ao Firebase...');
      const { user: fbUser } = await signInAnonymously(auth);
      const uid = fbUser.uid;

      // ── FAST PATH: cache de senha (usuário já cadastrado) ───────────────
      try {
        emit('Verificando cadastro local...');
        const cached = await getDoc(doc(db, 'users', username));
        if (cached.exists()) {
          const data = cached.data() as UserProfile;
          if (data.passwordHash && data.salt) {
            const hash = await sha256Hex(password + data.salt);
            if (hash === data.passwordHash) {
              await setDoc(doc(db, 'uid_map', uid), { username });
              const profile: UserProfile = { ...data, uid };
              await persistProfile(uid, profile);
              setUser(profile);
              emit('Acesso liberado!');
              return profile;
            }
          }
        }
      } catch {
        // Falha silenciosa — segue para validação SILOMS
      }

      // ── SLOW PATH: validação via worker SILOMS ──────────────────────────
      emit('Enviando credenciais para validação no SILOMS...');
      const requestId  = `${uid}_${Date.now()}`;
      const requestRef = doc(db, 'auth_requests', requestId);

      await setDoc(requestRef, {
        usuario: username, senha: btoa(password),
        status: 'pending', createdAt: serverTimestamp(), uid,
      });

      emit('Aguardando resposta do worker interno (até 45s)...');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          signOut(auth);
          emit('Tempo esgotado. Verifique se o worker está rodando.');
          resolve(null);
        }, 45000);

        const unsubscribe = onSnapshot(requestRef, async (snap) => {
          const data = snap.data();
          if (!data || data.status === 'pending') return;

          clearTimeout(timeout);
          unsubscribe();

          if (data.status === 'approved') {
            emit('Login aprovado! Carregando perfil...');
            try {
              await setDoc(doc(db, 'uid_map', uid), { username });

              const profSnap = await getDoc(doc(db, 'users', username));
              const salt = newSalt();
              const passwordHash = await sha256Hex(password + salt);

              let profile: UserProfile;
              if (profSnap.exists()) {
                // Perfil já existe — atualiza uid + hash da senha (caso senha tenha mudado)
                profile = { ...profSnap.data() as UserProfile, uid, passwordHash, salt };
              } else {
                // Primeiro login — cria perfil com senha cacheada
                profile = { uid, username, role: 'Visualizador', isAdmin: false, passwordHash, salt };
              }

              await persistProfile(uid, profile);
              setUser(profile);
              resolve(profile);
            } catch (err) {
              console.error('Erro ao carregar perfil após aprovação:', err);
              await signOut(auth);
              setUser(null);
              resolve(null);
            }
          } else {
            emit('Acesso negado. Verifique usuário e senha do SILOMS.');
            await signOut(auth);
            setUser(null);
            resolve(null);
          }
        });
      });

    } catch (error) {
      console.error('Erro no processo de login:', error);
      await signOut(auth);
      return null;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return context;
};
