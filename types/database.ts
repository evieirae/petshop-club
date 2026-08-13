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
  // Ver supabase/migrations/0004_intervalo_agendamento.sql — espaçamento
  // entre horários selecionáveis na agenda (lib/horarios.ts).
  intervalo_agendamento_minutos: number;
  criado_em: string;
}

export interface UsuarioPetshop {
  id: string;
  petshop_id: string;
  auth_user_id: string;
  nome: string;
  papel: "dono" | "atendente";
  // Ver supabase/migrations/0002_admin_plataforma.sql — true = enxerga/edita
  // petshops de TODOS os petshops (taxas da plataforma), nao so o proprio.
  // So marcado na mao via SQL Editor, sem UI de auto-promocao.
  eh_admin_plataforma: boolean;
  criado_em: string;
}

// Lookups globais (mesmos pra todo petshop) — ver supabase/migrations/0001_init.sql.
export interface Porte {
  id: number;
  nome: string;
  ordem: number;
}

export interface CategoriaServico {
  id: number;
  nome: string;
}

// Catálogo por petshop (Fase 2 do roadmap — ver docs/regras_padrao_petshop.md seção 4).
export interface Servico {
  id: string;
  petshop_id: string;
  categoria_servico_id: number;
  nome_customizado: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface PrecoServico {
  id: string;
  servico_id: string;
  porte_id: number;
  preco: number;
}

export interface Plano {
  id: string;
  petshop_id: string;
  nome: string;
  intervalo_dias: number;
  ocorrencias_padrao_mes: number;
  ativo: boolean;
  criado_em: string;
}

export interface PlanoServico {
  plano_id: string;
  servico_id: string;
}

export interface PlanoPreco {
  id: string;
  plano_id: string;
  porte_id: number;
  preco_assinatura: number;
}

// Tutores e pets (Fase 3 do roadmap — ver docs/regras_padrao_petshop.md secao 6).
export interface Tutor {
  id: string;
  petshop_id: string;
  nome: string;
  telefone: string;
  email: string | null;
  endereco: string | null;
  cadastro_completo: boolean;
  criado_em: string;
}

export type PapelContato = "agendamento" | "busca_entrega" | "cobranca";

export interface ContatoAdicional {
  id: string;
  petshop_id: string;
  tutor_id: string;
  papel: PapelContato;
  nome: string;
  telefone: string;
  criado_em: string;
}

export interface Pet {
  id: string;
  petshop_id: string;
  tutor_id: string;
  porte_id: number;
  nome: string;
  raca: string | null;
  observacoes: string | null;
  criado_em: string;
}

// Assinaturas e agenda (Fase 4 do roadmap — ver supabase/migrations/0003_fase4_assinaturas_agenda.sql).
export type StatusAssinatura = "ativa" | "pausada" | "cancelada";

export interface Assinatura {
  id: string;
  petshop_id: string;
  tutor_id: string;
  pet_id: string;
  plano_id: string;
  status: StatusAssinatura;
  dia_semana_preferencial: number; // 0=domingo..6=sabado
  horario_preferencial: string;
  data_inicio: string;
  proxima_data_agendamento: string | null;
  competencia_paga: string | null;
  banhos_restantes_mes: number;
  metodo_pagamento_id: string | null;
  gateway_subscription_id: string | null;
  criado_em: string;
}

export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "pronto"
  | "entregue"
  | "faltou"
  | "reagendado"
  | "cancelado";

// assinatura_id nulo = visita avulsa — nesse caso tutor_id/pet_id/servico_id/
// preco_avulso vem preenchido (ver CHECK agendamentos_assinatura_xor_avulsa).
// Nunca os dois grupos juntos, nunca nenhum dos dois.
export interface Agendamento {
  id: string;
  petshop_id: string;
  assinatura_id: string | null;
  tutor_id: string | null;
  pet_id: string | null;
  servico_id: string | null;
  preco_avulso: number | null;
  data_hora: string;
  status: StatusAgendamento;
  confirmado_em: string | null;
  pronto_em: string | null;
  entregue_em: string | null;
  observacoes: string | null;
  criado_em: string;
}

export type StatusCobranca = "pendente" | "pago" | "falhou" | "estornado";

// Cobrança mensal proporcional de assinatura — 1 linha por mês por assinatura.
export interface Cobranca {
  id: string;
  petshop_id: string;
  assinatura_id: string;
  agendamento_gatilho_id: string | null;
  competencia: string;
  quantidade_banhos: number;
  valor_total: number;
  valor_percentual: number;
  valor_petshop: number;
  status: StatusCobranca;
  gateway_payment_id: string | null;
  pago_em: string | null;
  criado_em: string;
}

// Cobrança de visita avulsa — 1 linha por visita (não por mês).
export interface CobrancaAvulsa {
  id: string;
  petshop_id: string;
  agendamento_id: string;
  tutor_id: string;
  valor_total: number;
  valor_percentual: number;
  valor_petshop: number;
  status: StatusCobranca;
  gateway_payment_id: string | null;
  pago_em: string | null;
  criado_em: string;
}

// Placeholder generico — mantem os clientes tipaveis sem travar em tudo
// que o schema completo (clube_banho_tosa_schema.sql) ja define.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
