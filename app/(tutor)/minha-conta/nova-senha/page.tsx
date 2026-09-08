import { redirect } from "next/navigation";
import { getTutorContext } from "@/lib/auth/getTutorContext";
import { alerta, texto } from "@/lib/ui/styles";
import { NovaSenhaForm } from "./NovaSenhaForm";

// A ÚNICA tela do portal que não passa por exigirTutor() — ela precisa
// abrir justamente quando a senha ainda é provisória, que é o caso em que
// aquele guard redireciona pra cá. Chamar exigirTutor() aqui seria um loop.
//
// Ela também serve como troca voluntária de senha (link no rodapé do
// portal), por isso o texto muda conforme `obrigatoria`.
export default async function NovaSenhaPage() {
  const contexto = await getTutorContext();
  if (!contexto) redirect("/login");

  const obrigatoria = contexto.precisaTrocarSenha;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className={texto.tituloPagina}>
          {obrigatoria ? "Crie sua senha" : "Trocar senha"}
        </h1>
        <p className={texto.subtitulo}>
          {obrigatoria
            ? "A senha que o petshop te passou é temporária e serve só pra este primeiro acesso."
            : "Escolha uma senha nova pra sua conta."}
        </p>
      </div>

      {obrigatoria && (
        <p className={alerta("atencao")}>
          Enquanto você não criar sua senha, o resto da sua conta fica
          fechado — inclusive pra quem tiver a senha temporária.
        </p>
      )}

      <NovaSenhaForm obrigatoria={obrigatoria} />
    </div>
  );
}
