import { redirect } from "next/navigation";

// "Planos & Serviços" virou uma aba dentro de /catalogo em 20/ago/2026.
// Este redirect existe pra não quebrar link salvo/favorito de quem já usava
// a rota antiga — pode sair depois que ninguém mais chegar por aqui.
export default function PlanosRedirect() {
  redirect("/catalogo");
}
