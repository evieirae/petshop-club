// Edge Function (Fase 5 — ver ROADMAP.md): drena a fila `lembretes` com
// status='pendente' e manda a mensagem de verdade pela WhatsApp Cloud API
// da Meta. Toda a lógica de QUANDO gerar um lembrete (checkpoints D-1,
// escalonamento) vive em SQL puro
// (supabase/migrations/0005_fase5_lembretes_whatsapp.sql) — essa function
// só cuida do envio em si, chamada pelo pg_cron a cada 2min (job
// "lembretes-enviar") via pg_net, autenticada por x-cron-secret (não
// carrega JWT de usuário nenhum — verify_jwt=false em supabase/config.toml).
//
// DECISÃO DE ENVIO (o que muda em relação a um provedor-intermediário):
// todo lembrete nosso é business-initiated, então o caminho PADRÃO é
// template aprovado. Texto livre só sai quando `janela_whatsapp_aberta()`
// diz que o contato mandou mensagem nas últimas 23h — aí a resposta fica
// mais natural na conversa. Nunca o contrário: template fora da janela é
// sempre válido, texto livre fora da janela é sempre erro 131047.
//
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pelo
// Supabase em toda Edge Function. As credenciais da Meta e o CRON_SECRET
// são configurados na mão via `supabase secrets set` — ver checklist
// operacional do ROADMAP.md, Fase 5.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarTemplate, enviarTexto, MetaApiError } from "../_shared/meta-whatsapp.ts";
import { montarMensagem, type InfoAgendamento, type InfoCobranca } from "../_shared/templates.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID") ?? "";
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
// Fixar a versão é de propósito: a Meta descontinua versões do Graph API a
// cada ~2 anos e mudar de versão sem revisar payload é como integração
// dessas quebra em silêncio. Env var pra dar pra subir sem redeploy.
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

const META_CONFIG = {
  phoneNumberId: META_PHONE_NUMBER_ID,
  accessToken: META_ACCESS_TOKEN,
  graphVersion: META_GRAPH_VERSION,
};

// Lote pequeno de propósito — volume de teste desta fase. Vai precisar ser
// recalibrado (paginação/fila real) quando entrar petshop de verdade na
// Fase 7. Vale lembrar que a Meta também tem rate limit por número
// (throughput padrão de 80 msg/s, e limite diário por qualidade do número).
const TAMANHO_LOTE = 50;

// Ramifica assinatura x avulsa pra achar o pet — mesma ramificação
// documentada em 0003_fase4_assinaturas_agenda.sql pra tutor_id, só que
// aqui é pet_id: agendamento avulso já tem pet_id direto; de assinatura
// vem via assinaturas.pet_id.
// deno-lint-ignore no-explicit-any
async function buscarInfoAgendamento(supabase: any, agendamentoId: string | null): Promise<InfoAgendamento | null> {
  if (!agendamentoId) return null;

  const { data: agendamento } = await supabase
    .from("agendamentos")
    .select("data_hora, pet_id, assinatura_id, petshop_id")
    .eq("id", agendamentoId)
    .maybeSingle();

  if (!agendamento) return null;

  let petId: string | null = agendamento.pet_id;
  if (!petId && agendamento.assinatura_id) {
    const { data: assinatura } = await supabase
      .from("assinaturas")
      .select("pet_id")
      .eq("id", agendamento.assinatura_id)
      .maybeSingle();
    petId = assinatura?.pet_id ?? null;
  }

  const [{ data: pet }, { data: petshop }] = await Promise.all([
    petId
      ? supabase.from("pets").select("nome, tutor_id, sexo").eq("id", petId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("petshops").select("nome").eq("id", agendamento.petshop_id).maybeSingle(),
  ]);

  let tutorNome = "";
  if (pet?.tutor_id) {
    const { data: tutor } = await supabase
      .from("tutores")
      .select("nome")
      .eq("id", pet.tutor_id)
      .maybeSingle();
    tutorNome = tutor?.nome ?? "";
  }

  const dataHora = new Date(agendamento.data_hora);
  return {
    petNome: pet?.nome ?? "seu pet",
    tutorNome,
    petshopNome: petshop?.nome ?? "o petshop",
    petSexo: pet?.sexo ?? null,
    dataFormatada: dataHora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    horaFormatada: dataHora.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

// Pro lembrete de cadastro não existe agendamento, mas o template ainda
// quer o nome do petshop — vem pelo tutor.
// deno-lint-ignore no-explicit-any
async function buscarPetshopDoTutor(supabase: any, tutorId: string | null): Promise<string | null> {
  if (!tutorId) return null;
  const { data: tutor } = await supabase
    .from("tutores")
    .select("petshop_id")
    .eq("id", tutorId)
    .maybeSingle();
  if (!tutor?.petshop_id) return null;
  const { data: petshop } = await supabase
    .from("petshops")
    .select("nome")
    .eq("id", tutor.petshop_id)
    .maybeSingle();
  return petshop?.nome ?? null;
}

function descreverErro(err: unknown): string {
  if (err instanceof MetaApiError) {
    const partes = [err.message];
    if (err.codigo !== null) partes.push(`code=${err.codigo}`);
    if (err.subcodigo !== null) partes.push(`subcode=${err.subcodigo}`);
    if (err.fbtraceId) partes.push(`fbtrace_id=${err.fbtraceId}`);
    return partes.join(" | ");
  }
  return err instanceof Error ? err.message : String(err);
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const { data: pendentes, error } = await supabase
    .from("lembretes")
    .select("*")
    .eq("status", "pendente")
    .eq("canal", "whatsapp")
    .order("criado_em")
    .limit(TAMANHO_LOTE);

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let enviados = 0;
  let falharam = 0;

  for (const lembrete of pendentes ?? []) {
    try {
      if (!lembrete.telefone_destino) {
        throw new Error("Sem telefone_destino gravado na geração do lembrete.");
      }

      let info = await buscarInfoAgendamento(supabase, lembrete.agendamento_id);
      if (!info && lembrete.tipo === "cadastro") {
        const petshopNome = await buscarPetshopDoTutor(supabase, lembrete.tutor_id);
        if (petshopNome) {
          info = {
            petNome: "",
            tutorNome: "",
            petshopNome,
            petSexo: null,
            dataFormatada: "",
            horaFormatada: "",
          };
        }
      }

      // cobranca_pix não usa InfoAgendamento (não precisa de data/hora de
      // visita) — o payload vem pronto em dados_extra, gravado por
      // processar-cobrancas na hora de criar a cobrança (ver migration 0007).
      let infoCobranca: InfoCobranca | null = null;
      if (lembrete.tipo === "cobranca_pix" && lembrete.dados_extra) {
        infoCobranca = {
          petNome: lembrete.dados_extra.petNome ?? "",
          valorFormatado: lembrete.dados_extra.valorFormatado ?? "",
          pixCopiaCola: lembrete.dados_extra.pixCopiaCola ?? "",
        };
      }

      const mensagem = montarMensagem({
        lembreteId: lembrete.id,
        tipo: lembrete.tipo,
        tutorId: lembrete.tutor_id,
        nomeDestino: lembrete.nome_destino,
        info,
        infoCobranca,
        appBaseUrl: APP_BASE_URL,
      });

      if (!mensagem) {
        throw new Error(
          `Tipo de lembrete '${lembrete.tipo}' sem template mapeado, ou dados do agendamento não encontrados.`
        );
      }

      const { data: janelaAberta } = await supabase.rpc("janela_whatsapp_aberta", {
        p_telefone: lembrete.telefone_destino,
      });

      const usarTexto = janelaAberta === true;
      const resultado = usarTexto
        ? await enviarTexto(META_CONFIG, lembrete.telefone_destino, mensagem.textoLivre)
        : await enviarTemplate(META_CONFIG, lembrete.telefone_destino, mensagem.template);

      await supabase
        .from("lembretes")
        .update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          provider_message_id: resultado.wamid,
          // Nulo aqui é informação, não ausência dela: significa "saiu como
          // texto livre porque a janela estava aberta".
          template_nome: usarTexto ? null : mensagem.template.nome,
          erro_envio: null,
        })
        .eq("id", lembrete.id);

      enviados++;
    } catch (err) {
      await supabase
        .from("lembretes")
        .update({ status: "falhou", erro_envio: descreverErro(err) })
        .eq("id", lembrete.id);
      falharam++;
    }
  }

  return new Response(JSON.stringify({ enviados, falharam }), {
    headers: { "Content-Type": "application/json" },
  });
});
