import { redirect } from "next/navigation";
import { getTutorContext, type TutorContext } from "@/lib/auth/getTutorContext";

/**
 * Guard das telas do portal do tutor.
 *
 * Vive aqui, e não no layout de app/(tutor), por um motivo prático: o layout
 * não sabe qual rota está sendo renderizada, e /minha-conta/nova-senha
 * PRECISA abrir justamente quando a senha ainda é provisória — se o redirect
 * morasse no layout, ele mandaria a tela de trocar senha pra ela mesma, em
 * loop.
 *
 * Toda tela nova do portal chama isto na primeira linha. A de trocar senha é
 * a única exceção, e chama getTutorContext() direto.
 */
export async function exigirTutor(): Promise<TutorContext> {
  const contexto = await getTutorContext();

  if (!contexto) redirect("/login");

  // Senha ainda é a que a administração definiu: o portal fica trancado
  // até o tutor definir a dele. É o que evita que uma senha conhecida por
  // terceiros dê acesso a dado de cliente (ver o bloco "SOBRE A SENHA
  // PADRAO" em supabase/migrations/0024_portal_tutor_acesso.sql).
  if (contexto.precisaTrocarSenha) redirect("/minha-conta/nova-senha");

  return contexto;
}
