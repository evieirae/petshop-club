// Registro dos templates da Meta usados pela Fase 5 — um por tipo de
// lembrete gerado hoje (0005_fase5_lembretes_whatsapp.sql).
//
// Este arquivo é a fonte da verdade do CÓDIGO; a fonte da verdade da META é
// o que está aprovado no WhatsApp Manager. Os dois precisam bater
// exatamente em nome, idioma, quantidade e ORDEM de parâmetros — se
// divergirem, a API rejeita com "template name does not exist" ou
// "number of parameters does not match". O texto exato submetido pra
// aprovação está em docs/whatsapp_templates_meta.md; mexeu aqui, mexe lá e
// resubmete o template.
//
// Cada tipo tem duas formas: o template (caminho padrão, business-initiated)
// e o texto livre equivalente, usado só quando a janela de 24h está aberta
// — aí a mensagem sai sem passar por aprovação e fica mais natural na
// conversa. Ver enviar-lembretes/index.ts.

import type { TemplateWhatsApp } from "./meta-whatsapp.ts";

const IDIOMA = "pt_BR";

export interface InfoAgendamento {
  petNome: string;
  tutorNome: string;
  petshopNome: string;
  dataFormatada: string;
  horaFormatada: string;
  // Migration 0008 — usado pra concordância de gênero em templates como
  // pet_pronto ("pronto"/"pronta"). Null = não informado, cai no masculino
  // por padrão (mesma convenção do "o pet" nos fallbacks abaixo).
  petSexo: "macho" | "femea" | null;
}

// Payload específico de cobranca_pix — vem de lembretes.dados_extra
// (migration 0007), montado por processar-cobrancas na hora de gerar a
// cobrança Pix (petNome resolvido via agendamento/assinatura, valor já
// formatado em R$, pixCopiaCola devolvido pelo Asaas).
export interface InfoCobranca {
  petNome: string;
  valorFormatado: string;
  pixCopiaCola: string;
}

export interface ContextoMensagem {
  lembreteId: string;
  tipo: string;
  tutorId: string | null;
  nomeDestino: string | null;
  info: InfoAgendamento | null;
  infoCobranca: InfoCobranca | null;
  appBaseUrl: string;
}

export interface MensagemMontada {
  template: TemplateWhatsApp;
  /** Equivalente em texto livre, pra quando a janela de 24h está aberta. */
  textoLivre: string;
}

/**
 * A Meta rejeita parâmetro de template vazio, com quebra de linha, tab ou
 * 4+ espaços seguidos. `nome_destino` é opcional no nosso schema
 * (resolver_contato pode devolver nome em branco) e endereço/nome digitado
 * pela equipe vem com formatação imprevisível — então tudo passa por aqui.
 */
function param(valor: string | null | undefined, padrao: string): string {
  const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
  return limpo.length > 0 ? limpo : padrao;
}

/**
 * Mensagens PRA o tutor usam só o primeiro nome ("mensagens mais humanas" —
 * pedido explícito). Não muda schema nem formulário de cadastro: o nome
 * completo continua salvo (necessário pro gateway de pagamento), só o
 * recorte pra exibição acontece aqui, na hora de montar a mensagem. Mesmo
 * padrão já usado pro nome da equipe em app/(app)/page.tsx.
 * Mensagens internas (ex.: confirmacao_pendente_petshop, que avisa a EQUIPE
 * sobre um tutor) continuam com nome completo — ali o objetivo é identificar
 * o cliente no sistema, não soar humano numa conversa.
 */
function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.split(" ")[0] || nomeCompleto;
}

export function montarMensagem(ctx: ContextoMensagem): MensagemMontada | null {
  switch (ctx.tipo) {
    case "cadastro": {
      if (!ctx.tutorId) return null;
      const petshop = param(ctx.info?.petshopNome, "o petshop");
      return {
        template: {
          nome: "cadastro_tutor",
          idioma: IDIOMA,
          parametrosCorpo: [petshop],
          // O template aprovado guarda a base .../cadastro/{{1}} — aqui vai
          // só o sufixo. Ver comentário em meta-whatsapp.ts.
          parametroBotaoUrl: ctx.tutorId,
        },
        textoLivre:
          `Olá! Pra gente completar seu cadastro na ${petshop}, é só preencher esse formulário rapidinho: ` +
          `${ctx.appBaseUrl}/cadastro/${ctx.tutorId}`,
      };
    }

    case "confirmacao_agendamento": {
      if (!ctx.info) return null;
      // Fallback impessoal porque a Meta não aceita parâmetro vazio — o
      // template é "Olá {{1}}!", então precisa de ALGO ali. Só acontece se
      // resolver_contato() devolveu nome em branco.
      const nome = primeiroNome(param(ctx.nomeDestino, "tutor"));
      return {
        template: {
          nome: "confirmacao_agendamento",
          idioma: IDIOMA,
          parametrosCorpo: [
            nome,
            param(ctx.info.petNome, "seu pet"),
            ctx.info.dataFormatada,
            ctx.info.horaFormatada,
            param(ctx.info.petshopNome, "o petshop"),
          ],
          parametroBotaoUrl: ctx.lembreteId,
        },
        textoLivre:
          `Olá ${nome}! Passando pra confirmar o banho/tosa do ${ctx.info.petNome} amanhã ` +
          `(${ctx.info.dataFormatada} às ${ctx.info.horaFormatada}) na ${ctx.info.petshopNome}. ` +
          `Confirme aqui: ${ctx.appBaseUrl}/confirmar/${ctx.lembreteId}`,
      };
    }

    case "confirmacao_manual_petshop": {
      if (!ctx.info) return null;
      return {
        template: {
          nome: "confirmacao_pendente_petshop",
          idioma: IDIOMA,
          parametrosCorpo: [
            param(ctx.info.petNome, "o pet"),
            param(ctx.info.tutorNome, "tutor não identificado"),
            ctx.info.horaFormatada,
          ],
        },
        textoLivre:
          `${ctx.info.petshopNome}: o agendamento de ${ctx.info.petNome} (tutor ${ctx.info.tutorNome}) ` +
          `pra amanhã às ${ctx.info.horaFormatada} ainda não foi confirmado pelo tutor — vale checar direto com o cliente.`,
      };
    }

    case "pet_pronto": {
      if (!ctx.info) return null;
      // Fallback impessoal porque a Meta não aceita parâmetro vazio — o
      // template é "Olá {{1}}!", então precisa de ALGO ali. Só acontece se
      // resolver_contato() devolveu nome em branco.
      const nome = primeiroNome(param(ctx.nomeDestino, "tutor"));
      // Concordância de gênero (migration 0008, pets.sexo) — a Meta não
      // aceita texto condicional dentro do corpo aprovado, só substituição
      // de {{n}}, então o adjetivo vira parâmetro. Sem sexo informado, cai
      // no masculino (mesma convenção do "o pet" no fallback de nome).
      const adjetivo = ctx.info.petSexo === "femea" ? "pronta" : "pronto";
      return {
        template: {
          nome: "pet_pronto",
          idioma: IDIOMA,
          parametrosCorpo: [
            nome,
            param(ctx.info.petNome, "seu pet"),
            adjetivo,
            param(ctx.info.petshopNome, "o petshop"),
          ],
        },
        textoLivre: `Olá ${nome}! O ${ctx.info.petNome} já está ${adjetivo} pra buscar na ${ctx.info.petshopNome}. Estamos te esperando!`,
      };
    }

    case "pet_entregue": {
      // Migration 0013 (18/ago/2026) — fecha o mesmo ciclo do pet_pronto
      // pelo outro lado: agradecimento automático quando a equipe marca
      // "entregue" (quadro de visitas do dia na Visão Geral, ou Agenda).
      // "Entregue" não muda por gênero (mesma forma pra macho/fêmea), então
      // — diferente de pet_pronto — não precisa de parâmetro de
      // concordância.
      if (!ctx.info) return null;
      const nome = primeiroNome(param(ctx.nomeDestino, "tutor"));
      return {
        template: {
          nome: "pet_entregue",
          idioma: IDIOMA,
          parametrosCorpo: [
            nome,
            param(ctx.info.petNome, "seu pet"),
            param(ctx.info.petshopNome, "o petshop"),
          ],
        },
        textoLivre: `Olá ${nome}! O ${ctx.info.petNome} já foi entregue — muito obrigado por confiar na ${ctx.info.petshopNome}. Até a próxima!`,
      };
    }

    case "cobranca_pix": {
      // Implementado em 17/ago/2026 (docs/fase6_pagamentos.md, gap fechado)
      // — gerado por processar-cobrancas logo depois de criar a cobrança
      // Pix no Asaas, tanto pra mensalidade de assinatura quanto pra visita
      // avulsa (por isso o corpo fala em "cobrança", não "mensalidade" —
      // ver docs/whatsapp_templates_meta.md, template 5).
      if (!ctx.infoCobranca) return null;
      const nome = primeiroNome(param(ctx.nomeDestino, "tutor"));
      const petNome = param(ctx.infoCobranca.petNome, "seu pet");
      const { valorFormatado, pixCopiaCola } = ctx.infoCobranca;
      if (!valorFormatado || !pixCopiaCola) return null;
      return {
        template: {
          nome: "cobranca_pix",
          idioma: IDIOMA,
          parametrosCorpo: [nome, petNome, valorFormatado, pixCopiaCola],
        },
        textoLivre:
          `Olá ${nome}! A cobrança do ${petNome} (${valorFormatado}) já está disponível pra pagamento via Pix. ` +
          `Copia e cola: ${pixCopiaCola}`,
      };
    }

    default:
      // cobranca_falhou / cartao_vencendo / aviso_cobranca / cadastro_cartao
      // são Fase 6 (ver docs/fase6_pagamentos.md e
      // supabase/migrations/0006_fase6_pagamentos.sql, seção 5b) —
      // reservados no CHECK de lembretes.tipo, mas nenhum gerador escreve
      // essas linhas ainda (checkpoint D-1 de cobrança e fluxo de
      // tokenização de cartão, respectivamente). Melhor falhar
      // explicitamente aqui do que mandar mensagem genérica errada.
      return null;
  }
}
