// Tipos minimos, escritos a mao, so pro que a fundacao do app usa hoje
// (contexto de autenticacao). Conforme as telas forem sendo construidas,
// troque isso pelo tipo gerado direto do schema:
//
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// Ai o Database<> genérico abaixo pode ser substituido pelo gerado, e os
// clientes em lib/supabase/*.ts continuam funcionando sem mudar nada.

export interface Petshop {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  endereco: string | null;
  fee_fixo_mensal: number;
  percentual_plataforma: number;
  isento_fee_ate: string | null;
  hora_abertura: string;
  hora_fechamento: string;
  hora_inicio_intervalo: string | null;
  hora_fim_intervalo: string | null;
  hora_divisao_periodo: string;
  horario_envio_lembrete: string;
  horario_corte_confirmacao_manha: string;
  horario_corte_confirmacao_tarde: string;
  horario_limite_petshop_tarde: string;
  falta_consome_visita_paga: boolean;
  criado_em: string;
}

export interface UsuarioPetshop {
  id: string;
  petshop_id: string;
  auth_user_id: string;
  nome: string;
  papel: "dono" | "atendente";
  criado_em: string;
}

// Placeholder generico — mantem os clientes tipaveis sem travar em tudo
// que o schema completo (clube_banho_tosa_schema.sql) ja define.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
