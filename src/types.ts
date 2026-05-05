export enum UserRole {
  AUDITOR = 'Auditor',
  APROVADOR = 'Aprovador',
  VISUALIZADOR = 'Visualizador',
}

export interface UserProfile {
  id: string; // Firebase Auth UID
  name: string;
  login: string;
  role: UserRole;
  email?: string;
}

export interface Invoice {
  id: string;
  id_nota: string;
  numero: string;
  fornecedor: string;
  valor: number;
  status: string;
  contrato: string;
  cnpj: string;
  urls_pdf: string[];
  historico_comentarios: string[];
  data_criacao: string;
}

export interface AuthRequest {
  id: string;
  username: string;
  status: 'pending' | 'approved' | 'rejected';
  uid: string; // The anonymous UID used for this request
  timestamp: any;
  error?: string;
}

export interface Command {
  id: string;
  command: 'retornar_nota' | 'avancar_nota' | 'download_notas' | 'auditar_ia';
  id_nota: string;
  status: 'pending' | 'completed' | 'failed';
  params: Record<string, any>;
  created_at: string;
  updated_at?: string;
  error?: string;
}
