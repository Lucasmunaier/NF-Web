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
  login: (username: string, password: string) => Promise<boolean>;
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

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // 1. Loga anonimamente no Firebase para obter permissão de escrita
      const userCredential = await signInAnonymously(auth);
      const uid = userCredential.user.uid;

      // 2. Cria a requisição de login para o Python ler
      const requestId = `${uid}_${Date.now()}`;
      const requestRef = doc(db, 'auth_requests', requestId);

      await setDoc(requestRef, {
        usuario: username,
        // Criptografia básica em Base64 para não transitar em texto 100% limpo
        // Em produção, o ideal é o Web App enviar o hash ou o Python ler via SSL
        senha: btoa(password), 
        status: 'pending',
        createdAt: serverTimestamp(),
        uid: uid
      });

      // 3. Fica "escutando" a resposta do Python em tempo real
      return new Promise((resolve) => {
        // Define um timeout de segurança (ex: 45 segundos) caso o Python esteja offline
        const timeout = setTimeout(() => {
          unsubscribe();
          signOut(auth); // Cancela a sessão anônima
          resolve(false);
        }, 45000);

        const unsubscribe = onSnapshot(requestRef, async (docSnap) => {
          const data = docSnap.data();
          if (data && data.status !== 'pending') {
            clearTimeout(timeout);
            unsubscribe(); // Para de escutar o documento

            if (data.status === 'approved') {
              // 4. Login no SILOMS aprovado! Verifica/Cria o perfil no Firebase
              const userProfileRef = doc(db, 'users', uid);
              const userProfileSnap = await getDoc(userProfileRef);
              
              let profileData: UserProfile;

              if (!userProfileSnap.exists()) {
                // Primeiro login deste usuário: cria com perfil padrão 'Visualizador'
                profileData = {
                  uid: uid,
                  username: username,
                  role: 'Visualizador',
                  isAdmin: false // <-- Garante que novatos entrem sem ser admin
                };
                await setDoc(userProfileRef, profileData);
              } else {
                profileData = userProfileSnap.data() as UserProfile;
              }

              setUser(profileData);
              
              // Opcional: Apaga a requisição de login por segurança após o sucesso
              // await deleteDoc(requestRef); 
              
              resolve(true);
            } else {
              // Rejeitado (senha errada no SILOMS)
              await signOut(auth);
              setUser(null);
              resolve(false);
            }
          }
        });
      });

    } catch (error) {
      console.error("Erro no processo de proxy de login:", error);
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