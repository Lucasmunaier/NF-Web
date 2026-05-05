import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc, serverTimestamp } from 'firebase/firestore';

// Tipagem do usuário logado
export interface UserProfile {
  uid: string;
  username: string;
  role: 'Auditor' | 'Aprovador' | 'Visualizador';
  isAdmin?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, setStatus?: (msg: string) => void) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verifica se o usuário já tem uma sessão ativa no Firebase ao carregar a página
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Busca o perfil do usuário no Firestore para saber a role (nível de acesso)
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as UserProfile);
        } else {
          // Se não tem perfil, consideramos como deslogado por segurança
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
  ): Promise<boolean> => {
    const emit = (msg: string) => setStatus?.(msg);

    try {
      emit('Conectando ao Firebase...');
      const userCredential = await signInAnonymously(auth);
      const uid = userCredential.user.uid;

      emit('Enviando credenciais para validação no SILOMS...');
      const requestId  = `${uid}_${Date.now()}`;
      const requestRef = doc(db, 'auth_requests', requestId);

      await setDoc(requestRef, {
        usuario:   username,
        senha:     btoa(password),
        status:    'pending',
        createdAt: serverTimestamp(),
        uid,
      });

      emit('Aguardando resposta do worker interno (até 45s)...');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          signOut(auth);
          emit('Tempo esgotado. Verifique se o worker está rodando.');
          resolve(false);
        }, 45000);

        const unsubscribe = onSnapshot(requestRef, async (docSnap) => {
          const data = docSnap.data();
          if (!data || data.status === 'pending') return;

          clearTimeout(timeout);
          unsubscribe();

          if (data.status === 'approved') {
            emit('Login aprovado! Carregando perfil...');
            const userProfileRef  = doc(db, 'users', uid);
            const userProfileSnap = await getDoc(userProfileRef);

            let profileData: UserProfile;
            if (!userProfileSnap.exists()) {
              profileData = { uid, username, role: 'Visualizador', isAdmin: false };
              await setDoc(userProfileRef, profileData);
            } else {
              profileData = userProfileSnap.data() as UserProfile;
            }

            setUser(profileData);
            resolve(true);
          } else {
            emit('Acesso negado. Verifique usuário e senha do SILOMS.');
            await signOut(auth);
            setUser(null);
            resolve(false);
          }
        });
      });

    } catch (error) {
      console.error('Erro no processo de login:', error);
      await signOut(auth);
      return false;
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
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};