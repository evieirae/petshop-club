"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import { type Mapeamento, sugerirMapeamento, validarMapeamento } from "@/lib/importacao/campos";
import { ErroLeitura, lerPlanilha, type PlanilhaLida } from "@/lib/importacao/leitor";
import {
  CAMPOS_TUTORES_PETS,
  conferirTutoresPets,
  type PetExistente,
  type PorteRef,
  type TutorExistente,
} from "@/lib/importacao/tutoresPets";

// ============================================================================
// Importação por planilha — Frente C, fatias C1 + C2.
//
// Três passos, sempre iguais:
//   1. lerCabecalhos  — lê o arquivo e devolve colunas + palpite de mapeamento.
//                       Não grava nada.
//   2. conferirArquivo — lê de novo (o navegador reenvia o mesmo arquivo),
//                       aplica o mapeamento, grava o LOTE e as LINHAS com a
//                       situação de cada uma. Nenhum tutor/pet é criado.
//   3. aplicarImportacao — chama aplicar_importacao_tutores_pets (SQL), que
//                       cria tudo numa transação, com RLS valendo.
//
// Tudo com o cliente da sessão (RLS), nunca service_role: um petshop não
// enxerga nem aplica lote de outro, mesmo mexendo no id.
// ============================================================================

type Erro = { ok: false; erro: string };

const ERRO_GENERICO = "Não deu certo agora. Tente de novo em alguns segundos.";
const TAMANHO_LOTE_INSERT = 500;
const TAMANHO_PAGINA = 1000; // limite padrão de linhas por select no Supabase

export type ResultadoLeitura =
  | {
      ok: true;
      arquivoNome: string;
      cabecalhos: string[];
      sugestao: Mapeamento;
      amostra: Record<string, string>[];
      totalLinhas: number;
    }
  | Erro;

function arquivoDoForm(formData: FormData): File | null {
  const arquivo = formData.get("arquivo");
  return arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
}

async function ler(arquivo: File): Promise<PlanilhaLida | Erro> {
  try {
    return await lerPlanilha(arquivo);
  } catch (e) {
    if (e instanceof ErroLeitura) return { ok: false, erro: e.message };
    console.error("Erro ao ler planilha:", e);
    return { ok: false, erro: "Não conseguimos ler esse arquivo. Confira se é um .xlsx ou .csv válido." };
  }
}

// ----------------------------------------------------------------------------
// Passo 1
// ----------------------------------------------------------------------------
export async function lerCabecalhos(formData: FormData): Promise<ResultadoLeitura> {
  const contexto = await getUsuarioContext();
  if (!contexto?.petshop?.id) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const arquivo = arquivoDoForm(formData);
  if (!arquivo) return { ok: false, erro: "Escolha um arquivo." };

  const lida = await ler(arquivo);
  if ("ok" in lida) return lida;

  return {
    ok: true,
    arquivoNome: arquivo.name,
    cabecalhos: lida.cabecalhos,
    sugestao: sugerirMapeamento(lida.cabecalhos, CAMPOS_TUTORES_PETS),
    amostra: lida.linhas.slice(0, 3).map((l) => l.valores),
    totalLinhas: lida.linhas.length,
  };
}

// ----------------------------------------------------------------------------
// Passo 2
// ----------------------------------------------------------------------------

/** select paginado — o Supabase corta em 1.000 linhas por chamada. */
async function buscarTodos<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await consulta(de, de + TAMANHO_PAGINA - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) return todos;
  }
}

export async function conferirArquivo(
  formData: FormData
): Promise<{ ok: true; id: string } | Erro> {
  const contexto = await getUsuarioContext();
  if (!contexto?.petshop?.id) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const petshopId = contexto.petshop.id;

  const arquivo = arquivoDoForm(formData);
  if (!arquivo) return { ok: false, erro: "Escolha um arquivo." };

  let mapeamento: Mapeamento;
  try {
    mapeamento = JSON.parse(String(formData.get("mapeamento") ?? "{}"));
  } catch {
    return { ok: false, erro: "Mapeamento de colunas inválido. Recarregue a página." };
  }

  const lida = await ler(arquivo);
  if ("ok" in lida) return lida;

  // Só os campos conhecidos, na ordem conhecida — nada que venha do
  // navegador além disso vai para o banco.
  const mapeamentoLimpo: Mapeamento = Object.fromEntries(
    CAMPOS_TUTORES_PETS.map((c) => [c.chave, mapeamento[c.chave] || null])
  );
  const erroMapeamento = validarMapeamento(mapeamentoLimpo, CAMPOS_TUTORES_PETS, lida.cabecalhos);
  if (erroMapeamento) return { ok: false, erro: erroMapeamento };

  const supabase = createClient();

  let portes: PorteRef[], tutores: TutorExistente[], pets: PetExistente[];
  try {
    [portes, tutores, pets] = await Promise.all([
      buscarTodos<PorteRef>((de, ate) => supabase.from("portes").select("id, nome").range(de, ate)),
      buscarTodos<TutorExistente>((de, ate) =>
        supabase
          .from("tutores")
          .select("id, nome, telefone_normalizado")
          .eq("petshop_id", petshopId)
          .order("id")
          .range(de, ate)
      ),
      buscarTodos<PetExistente>((de, ate) =>
        supabase.from("pets").select("tutor_id, nome").eq("petshop_id", petshopId).order("id").range(de, ate)
      ),
    ]);
  } catch (e) {
    console.error("Erro ao carregar carteira para conferência:", e);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const conferidas = conferirTutoresPets(lida.linhas, mapeamentoLimpo, { portes, tutores, pets });
  const contar = (s: string) => conferidas.filter((l) => l.situacao === s).length;

  const { data: lote, error: erroLote } = await supabase
    .from("importacoes")
    .insert({
      petshop_id: petshopId,
      entidade: "tutores_pets",
      arquivo_nome: arquivo.name.slice(0, 200),
      arquivo_tipo: lida.tipo,
      status: "analisando",
      mapeamento: mapeamentoLimpo,
      criado_por: contexto.usuario?.id ?? null,
    })
    .select("id")
    .single();

  if (erroLote || !lote) {
    console.error("Erro ao criar lote de importação:", erroLote);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const id = lote.id as string;

  for (let i = 0; i < conferidas.length; i += TAMANHO_LOTE_INSERT) {
    const { error } = await supabase.from("importacao_linhas").insert(
      conferidas.slice(i, i + TAMANHO_LOTE_INSERT).map((l) => ({
        importacao_id: id,
        petshop_id: petshopId,
        numero_linha: l.numero_linha,
        dados_brutos: l.dados_brutos,
        dados_normalizados: l.dados_normalizados,
        situacao: l.situacao,
        erro: l.erro,
        avisos: l.avisos,
      }))
    );
    if (error) {
      console.error("Erro ao gravar linhas da importação:", error);
      await supabase
        .from("importacoes")
        .update({ status: "falhou", mensagem_erro: "Falha ao gravar as linhas da conferência.", atualizado_em: new Date().toISOString() })
        .eq("id", id);
      return { ok: false, erro: ERRO_GENERICO };
    }
  }

  const { error: erroFechar } = await supabase
    .from("importacoes")
    .update({
      status: "pronta",
      total_linhas: conferidas.length,
      linhas_novas: contar("nova"),
      linhas_duplicadas: contar("duplicada"),
      linhas_erro: contar("erro"),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (erroFechar) {
    console.error("Erro ao fechar conferência:", erroFechar);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/importar");
  return { ok: true, id };
}

// ----------------------------------------------------------------------------
// Passo 3
// ----------------------------------------------------------------------------
export type ResultadoAplicar =
  | { ok: true; tutoresCriados: number; petsCriados: number; duplicadas: number }
  | Erro;

export async function aplicarImportacao(importacaoId: string): Promise<ResultadoAplicar> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("aplicar_importacao_tutores_pets", {
    p_importacao_id: importacaoId,
  });

  if (error) {
    console.error("Erro ao aplicar importação:", error);
    // A transação desfez tudo (inclusive o status 'aplicando'), então o lote
    // continua 'pronta' e dá para tentar de novo. Fica registrado o motivo.
    await supabase
      .from("importacoes")
      .update({ mensagem_erro: error.message.slice(0, 500), atualizado_em: new Date().toISOString() })
      .eq("id", importacaoId)
      .eq("status", "pronta");
    revalidatePath(`/importar/${importacaoId}`);
    return {
      ok: false,
      erro:
        error.code === "P0001"
          ? "Esta importação já foi aplicada (ou não está pronta). Recarregue a página."
          : "Não deu para aplicar. Nada foi gravado — tente de novo em alguns segundos.",
    };
  }

  const r = (data ?? {}) as { tutores_criados?: number; pets_criados?: number; duplicadas?: number };
  revalidatePath("/importar");
  revalidatePath(`/importar/${importacaoId}`);
  revalidatePath("/tutores");
  revalidatePath("/pets");
  return {
    ok: true,
    tutoresCriados: r.tutores_criados ?? 0,
    petsCriados: r.pets_criados ?? 0,
    duplicadas: r.duplicadas ?? 0,
  };
}

/** Joga fora um lote que ainda não foi aplicado (as linhas vão junto, cascade). */
export async function descartarImportacao(importacaoId: string): Promise<{ ok: true } | Erro> {
  const supabase = createClient();
  const { error, count } = await supabase
    .from("importacoes")
    .delete({ count: "exact" })
    .eq("id", importacaoId)
    .in("status", ["analisando", "pronta", "falhou"]);

  if (error) {
    console.error("Erro ao descartar importação:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: "Só dá para descartar uma importação que ainda não foi aplicada." };

  revalidatePath("/importar");
  return { ok: true };
}
