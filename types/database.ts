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
  // Fase 6 (ver supabase/migrations/0006_fase6_pagamentos.sql) — identidade
  // do petshop no gateway de pagamento. gateway_wallet_id recebe o split
  // de cada cobrança do tutor; gateway_customer_id é o petshop como
  // PAGADOR do próprio fee mensal (papel invertido).
  gateway_wallet_id: string | null;
  gateway_customer_id: string | null;
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
  // Migration 0016 — comissão configurável. Percentuais em PONTO
  // PERCENTUAL (5 = 5%), diferente de percentual_plataforma, que é fração.
  // comissao_ativa=false (padrão) esconde o assunto na tela e zera qualquer
  // cálculo. Cada funcionário pode sobrescrever esses padrões.
  comissao_ativa: boolean;
  comissao_percentual_venda: number;
  comissao_percentual_servico: number;
  // Ver supabase/migrations/0004_intervalo_agendamento.sql — espaçamento
  // entre horários selecionáveis na agenda (lib/horarios.ts).
  intervalo_agendamento_minutos: number;
  // Migration 0017 — congelamento/encerramento de conta pelo admin da
  // plataforma. "ativo" (padrão) é o único status em que a equipe desse
  // petshop consegue logar (ver app/(app)/layout.tsx).
  status: "ativo" | "congelado" | "encerrado";
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

// Migration 0017 — admin da plataforma, identidade INDEPENDENTE de petshop
// (ver lib/auth/getAdminContext.ts). Substitui
// usuarios_petshop.eh_admin_plataforma. Só marcado na mão via SQL Editor,
// sem UI de auto-promoção.
export interface AdminPlataforma {
  id: string;
  auth_user_id: string;
  nome: string;
  criado_em: string;
}

// Migration 0018 — pedido de cotação vindo da Home pública (app/page.tsx).
// Nunca cria petshop sozinho — conversão é manual, pelo admin
// (app/(admin)/admin/leads).
export type StatusLeadSaas = "novo" | "contatado" | "convertido" | "descartado";

export interface LeadSaas {
  id: string;
  nome_petshop: string | null;
  nome_responsavel: string | null;
  email: string;
  telefone: string | null;
  mensagem: string | null;
  status: StatusLeadSaas;
  petshop_id: string | null;
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

// Migration 0011 — 'local' bypassa o gateway inteiro (pagamento presencial:
// dinheiro, Pix pessoal, maquininha própria do petshop). Diferente de
// 'cartao'/'pix', que passam pelo Asaas (Fase 6) com taxa de serviço somada
// ao tutor, 'local' nunca tem taxa nenhuma — ver comentário da migration.
export type FormaPagamento = "cartao" | "pix" | "local";

// Tutores e pets (Fase 3 do roadmap — ver docs/regras_padrao_petshop.md secao 6).
export interface Tutor {
  id: string;
  petshop_id: string;
  nome: string;
  telefone: string;
  email: string | null;
  endereco: string | null;
  cadastro_completo: boolean;
  // Fase 6 — ver supabase/migrations/0006_fase6_pagamentos.sql.
  // forma_pagamento_preferida decide cartão x Pix em processar-cobrancas.
  // cpf/gateway_customer_id: o Asaas exige CPF pra criar um customer, e é
  // o customer que qualquer cobrança (cartão OU Pix) referencia — não só
  // cartão. Ambos nulos até a 1ª cobrança processada com sucesso.
  // Migration 0011 — 'local' é o bypass do gateway inteiro (pagamento
  // presencial, sem taxa de serviço somada ao tutor). Ver FormaPagamento.
  forma_pagamento_preferida: FormaPagamento;
  cpf: string | null;
  gateway_customer_id: string | null;
  // Migration 0019 — soft-delete. false = tutor desativado (some das
  // listas/pickers padrão, histórico intacto). Ver
  // app/(app)/tutores/actions.ts, alternarAtivoTutor.
  ativo: boolean;
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

export type SexoPet = "macho" | "femea";

// Migration 0010 — null pros pets cadastrados antes dessa coluna existir
// (mesmo padrão de sexo, 0008). "outro" cobre qualquer pet que não seja
// cachorro/gato (ex.: pássaro, coelho, réptil) — pra esses (e pra null), a
// raça é sempre texto livre, sem lista curada (ver lib/pets/racas.ts).
export type EspeciePet = "cachorro" | "gato" | "outro";

export interface Pet {
  id: string;
  petshop_id: string;
  tutor_id: string;
  porte_id: number;
  nome: string;
  raca: string | null;
  observacoes: string | null;
  // Migration 0008 — null pros pets cadastrados antes dessa coluna existir.
  // Usado pra concordância de gênero em mensagens automáticas.
  sexo: SexoPet | null;
  // Migration 0010 — null pros pets cadastrados antes dessa coluna existir.
  // Quando cachorro/gato, a UI sugere uma lista das raças mais comuns
  // (CampoRaca/lib/pets/racas.ts); raca continua sendo o texto final salvo,
  // sempre editável livremente independente do que foi selecionado aqui.
  especie: EspeciePet | null;
  // Migration 0019 — soft-delete, substitui a exclusão definitiva que
  // existia antes. false = pet desativado (some das listas/pickers padrão,
  // histórico intacto). Ver app/(app)/tutores/actions.ts, alternarAtivoPet.
  ativo: boolean;
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
  // Migration 0014 (18/ago/2026) — pet chegou, está no banho/tosa agora.
  // Fica entre "confirmado" (ainda não chegou) e "pronto" (atendimento já
  // terminou). Só o quadro de visitas do dia (Visão Geral) e a Agenda usam
  // esse status; nada mais no schema lê/escreve nele.
  | "presente"
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
  // Migration 0009 — repetição livre (recorrência sem plano). As três andam
  // juntas: ou a visita faz parte de uma série, ou as três são null.
  // Visita de assinatura NUNCA tem série (a recorrência vem do plano).
  serie_id: string | null;
  serie_intervalo_dias: number | null;
  /** Quantas ocorrências ainda nascem DEPOIS desta. 0 = última da série. */
  serie_restantes: number | null;
  // Migration 0016 — quem executou o banho/tosa (base da comissão de
  // serviço). Opcional: visita sem responsável simplesmente não gera
  // comissão pra ninguém.
  funcionario_id: string | null;
  criado_em: string;
}

// Migration 0014 (18/ago/2026) — log append-only de toda mudança de status
// em `agendamentos`, gerado sozinho por trg_agendamentos_status_evento (uma
// linha por transição, inclusive reversões via voltar_status_agendamento()).
// Existe pra dar métrica futura de "quanto tempo cada visita fica em cada
// status" — nenhuma tela escreve aqui direto, e por enquanto nenhuma tela lê
// direto também (fica pronto pra quando um relatório precisar).
export type OrigemStatusEvento = "avanco" | "reversao" | "outro";

export interface AgendamentoStatusEvento {
  id: string;
  petshop_id: string;
  agendamento_id: string;
  status: StatusAgendamento;
  origem: OrigemStatusEvento;
  criado_em: string;
}

// Fase 6 (ver supabase/migrations/0006_fase6_pagamentos.sql):
// 'processando' = cobrança de cartão criada no gateway, esperando o
// webhook confirmar. 'aguardando_pagamento' = QR Pix gerado, esperando o
// tutor pagar (tem prazo — pix_expira_em). 'isento' só existe em
// mensalidades_petshop (trial do piloto).
export type StatusCobranca =
  | "pendente"
  | "processando"
  | "aguardando_pagamento"
  | "pago"
  | "falhou"
  | "estornado"
  | "isento";

// Colunas de controle de gateway compartilhadas pelas 3 tabelas de
// cobrança (Fase 6) — dunning (retry D+1/D+4) e Pix.
interface CamposGatewayCobranca {
  tentativas: number;
  proxima_tentativa_em: string | null;
  erro_gateway: string | null;
  pix_qr_code: string | null;
  pix_expira_em: string | null;
}

// Taxa de serviço somada ao tutor (Fase 6, decisão de 16/ago/2026 — ver
// docs/fase6_pagamentos.md seção 1c e 0006_fase6_pagamentos.sql seção 2b).
// Só existe em cobrancas/cobrancas_avulsas — mensalidades_petshop não tem
// split, então não precisa dessa distinção. Ambos nulos até
// processar-cobrancas decidir o meio de pagamento (cartão x Pix).
interface CamposTaxaServico {
  valor_taxa_gateway: number | null;
  valor_cobrado_tutor: number | null;
}

// Migration 0011 — como esta cobrança específica foi/vai ser paga. Nasce
// copiada de tutores.forma_pagamento_preferida (trigger), mas o balcão pode
// trocar por cobrança individual (Financeiro → "Marcar pago no local").
// Null só em cobrança criada antes da 0011. Só em cobrancas/cobrancas_avulsas
// — mensalidades_petshop não tem (quem paga ali é o petshop, não o tutor).
interface CamposFormaPagamento {
  forma_pagamento: FormaPagamento | null;
}

// Cobrança mensal proporcional de assinatura — 1 linha por mês por assinatura.
export interface Cobranca extends CamposGatewayCobranca, CamposTaxaServico, CamposFormaPagamento {
  id: string;
  petshop_id: string;
  assinatura_id: string;
  agendamento_gatilho_id: string | null;
  competencia: string;
  quantidade_banhos: number;
  valor_total: number;
  valor_percentual: number;
  // Fase 6: sempre igual a valor_total — o petshop recebe o valor cheio do
  // serviço (fixedValue no split), nunca mais valor_total − valor_percentual.
  valor_petshop: number;
  status: StatusCobranca;
  gateway_payment_id: string | null;
  pago_em: string | null;
  criado_em: string;
}

// Cobrança de visita avulsa — 1 linha por visita (não por mês).
export interface CobrancaAvulsa extends CamposGatewayCobranca, CamposTaxaServico, CamposFormaPagamento {
  id: string;
  petshop_id: string;
  agendamento_id: string;
  tutor_id: string;
  valor_total: number;
  valor_percentual: number;
  // Fase 6: sempre igual a valor_total — mesma mudança de Cobranca acima.
  valor_petshop: number;
  status: StatusCobranca;
  gateway_payment_id: string | null;
  pago_em: string | null;
  criado_em: string;
}

// Mensalidade fixa da plataforma, cobrada do PETSHOP (não do tutor) — ver
// gerar_mensalidade_petshop() em 0001_init.sql. Sem valor_percentual/
// valor_petshop porque não tem split: é receita da plataforma inteira.
export interface MensalidadePetshop extends CamposGatewayCobranca {
  id: string;
  petshop_id: string;
  competencia: string;
  valor: number;
  status: StatusCobranca;
  gateway_payment_id: string | null;
  pago_em: string | null;
  criado_em: string;
}

// Cartão tokenizado do tutor (0001_init.sql) — nunca guardamos o número,
// só o que o gateway devolve.
export interface MetodoPagamento {
  id: string;
  petshop_id: string;
  tutor_id: string;
  gateway_customer_id: string;
  gateway_payment_method_id: string;
  bandeira: string | null;
  ultimos_4_digitos: string | null;
  validade_mes: number | null;
  validade_ano: number | null;
  padrao: boolean;
  ativo: boolean;
  criado_em: string;
}

// Log bruto de webhook do gateway (Fase 6) — dedupe por gateway_event_id +
// auditoria. Sem policy de RLS (só service_role), mesmo padrão de
// JanelaWhatsApp — não é lido por nenhuma tela ainda.
export interface EventoGateway {
  id: string;
  gateway_event_id: string;
  tipo: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  processado_em: string | null;
  erro: string | null;
  criado_em: string;
}

// Lembretes automáticos (Fase 5 — ver supabase/migrations/0005_fase5_lembretes_whatsapp.sql
// e docs/regras_padrao_petshop.md, seção 2). agendamento_id é nulo só pro
// tipo 'cadastro' (ainda não existe agendamento); nos demais tipos,
// tutor_id fica nulo e a linha é resolvida via agendamento_id.
export type TipoLembrete =
  | "confirmacao_agendamento"
  | "confirmacao_manual_petshop"
  | "pet_pronto"
  // Migration 0013 — agradecimento automático quando a equipe marca
  // "entregue" (pelo quadro da Visão Geral ou pela Agenda). Mesmo desenho
  // de pet_pronto: vai pro contato de papel='busca_entrega'.
  | "pet_entregue"
  | "cadastro"
  | "cobranca_falhou"
  | "cartao_vencendo"
  // Fase 6 (ver supabase/migrations/0006_fase6_pagamentos.sql, seção 5b) —
  // cobranca_pix leva o copia-e-cola do mês; aviso_cobranca é o D-1 antes
  // de debitar o cartão; cadastro_cartao é o link de tokenização.
  | "cobranca_pix"
  | "aviso_cobranca"
  | "cadastro_cartao"
  // Migration 0020 — "chamar de volta" um pet sem visita há um tempo,
  // disparado manualmente em app/(app)/pets/PetsSection.tsx. De propósito
  // SEM gerador de mensagem ainda (é categoria MARKETING, pendente de
  // template — ver comentário na migration): fica reservado no CHECK,
  // mesma situação de cobranca_falhou/cartao_vencendo/aviso_cobranca/
  // cadastro_cartao hoje.
  | "retencao_cliente";

export type DestinatarioLembrete = "tutor" | "petshop";

export type PapelDestinoLembrete = "agendamento" | "busca_entrega" | "cobranca";

// Sem valor 'confirmado' aqui — status é só o estado do ENVIO da mensagem;
// a confirmação em si vive em confirmado_em/resposta, separado do envio.
// 'entregue'/'lido' só existem porque a Meta reporta o ciclo completo por
// webhook (supabase/functions/whatsapp-webhook): 'enviado' é "a Meta
// aceitou", 'entregue' é "chegou no aparelho" — número inativo fica preso
// no primeiro.
export type StatusLembrete = "pendente" | "enviado" | "entregue" | "lido" | "falhou";

export interface Lembrete {
  id: string;
  agendamento_id: string | null;
  tutor_id: string | null;
  tipo: TipoLembrete;
  destinatario: DestinatarioLembrete;
  papel_destino: PapelDestinoLembrete | null;
  canal: string;
  status: StatusLembrete;
  resposta: string | null;
  confirmado_em: string | null;
  enviado_em: string | null;
  // Snapshot de auditoria capturado na geração da linha, não no envio —
  // ver comentário da coluna na migration 0005.
  telefone_destino: string | null;
  nome_destino: string | null;
  // wamid.* da Meta — chave que o webhook usa pra casar os callbacks de
  // status com esta linha.
  provider_message_id: string | null;
  // Template aprovado usado no envio; nulo = saiu como texto livre porque a
  // janela de 24h estava aberta (ver docs/whatsapp_templates_meta.md).
  template_nome: string | null;
  erro_envio: string | null;
  entregue_em: string | null;
  lido_em: string | null;
  // Payload específico do tipo (ex.: cobranca_pix precisa de petNome/
  // valorFormatado/pixCopiaCola — migration 0007; retencao_cliente precisa
  // de petNome/dias — migration 0020). Null pros tipos que não precisam.
  dados_extra: Record<string, unknown> | null;
  criado_em: string;
}

// Janela de atendimento de 24h da Meta, alimentada pelo webhook. Chaveada
// por telefone (não tutor_id) porque quem responde pode ser um
// contato_adicional — ver seção 7 da migration 0005.
export interface JanelaWhatsApp {
  telefone: string;
  ultima_mensagem_recebida: string;
  atualizado_em: string;
}

// Produtos, estoque e vendas (Fase 3 do pedido de 18/ago/2026 — ver
// supabase/migrations/0012_produtos_estoque_vendas.sql).
export interface Produto {
  id: string;
  petshop_id: string;
  nome: string;
  categoria: string | null;
  preco_venda: number;
  custo: number | null;
  // Cache decrementado só por registrar_venda() — reposição nesta fase é
  // edição manual do campo pela tela de catálogo (sem log em
  // movimentos_estoque ainda, ver comentário da migration).
  estoque_atual: number;
  estoque_minimo: number | null;
  ativo: boolean;
  criado_em: string;
}

export type StatusVenda = "pendente" | "pago" | "cancelada";

// tutor_id/agendamento_id opcionais de propósito — venda de balcão não
// exige cliente cadastrado (decisão do Eduardo, 18/ago/2026).
// forma_pagamento reaproveita o desenho da migration 0011: cartão/Pix pela
// plataforma, 'local' sem taxa nenhuma.
export interface Venda {
  id: string;
  petshop_id: string;
  tutor_id: string | null;
  agendamento_id: string | null;
  forma_pagamento: FormaPagamento;
  valor_total: number;
  status: StatusVenda;
  // Migration 0016 — vendedor e comissão. Os dois valores são SNAPSHOT do
  // momento da venda: mudar o percentual padrão depois não reescreve
  // comissão de venda antiga (mesmo espírito de venda_itens.preco_unitario).
  funcionario_id: string | null;
  comissao_percentual: number;
  valor_comissao: number;
  criado_em: string;
}

// Sem petshop_id direto — mesmo padrão de PlanoPreco/PlanoServico/PrecoServico.
// preco_unitario é o snapshot de produtos.preco_venda no momento da venda.
export interface VendaItem {
  id: string;
  venda_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export type TipoMovimentoEstoque = "entrada" | "saida" | "ajuste";

// Log de toda entrada/saída/ajuste de estoque — só ganha linhas automáticas
// de registrar_venda() nesta fase (tipo='saida', motivo='venda').
export interface MovimentoEstoque {
  id: string;
  petshop_id: string;
  produto_id: string;
  tipo: TipoMovimentoEstoque;
  quantidade: number;
  motivo: string | null;
  venda_id: string | null;
  criado_em: string;
}

// Migration 0016 — equipe do petshop pra atendimento e comissão. NÃO é
// login: quem acessa o sistema continua em UsuarioPetshop. Um funcionário
// pode existir aqui sem nunca ter conta no Supabase Auth (decisão do
// Eduardo, 20/ago/2026).
export type FuncaoFuncionario =
  | "tosador"
  | "banhista"
  | "atendente"
  | "vendedor"
  | "veterinario"
  | "outro";

export interface Funcionario {
  id: string;
  petshop_id: string;
  nome: string;
  funcao: FuncaoFuncionario;
  telefone: string | null;
  ativo: boolean;
  // null = herda o padrão do petshop (petshops.comissao_percentual_*).
  // 0 = "esse funcionário não ganha comissão nisso" — coisas diferentes,
  // por isso nullable em vez de default 0.
  comissao_percentual_venda: number | null;
  comissao_percentual_servico: number | null;
  criado_em: string;
}

// Retorno de resumo_comissoes(petshop, inicio, fim) — ver migration 0016.
export interface ResumoComissao {
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_funcao: FuncaoFuncionario;
  qtd_vendas: number;
  total_vendas: number;
  comissao_vendas: number;
  qtd_servicos: number;
  total_servicos: number;
  comissao_servicos: number;
  comissao_total: number;
}

// Placeholder generico — mantem os clientes tipaveis sem travar em tudo
// que o schema completo (clube_banho_tosa_schema.sql) ja define.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
