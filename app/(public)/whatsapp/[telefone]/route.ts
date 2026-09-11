import { NextResponse, type NextRequest } from "next/server";

// Rota-ponte pro deep link do WhatsApp (https://wa.me/<numero>).
//
// Existe só por causa de uma regra da Meta: botão de template ("Acessar o
// site") não pode apontar direto pra wa.me/whatsapp.com — o formulário
// rejeita com "Os botões não podem conter links diretos para o WhatsApp".
// Então o botão do template confirmacao_pendente_petshop (ver
// docs/whatsapp_templates_meta.md, template 3) aponta pra cá
// (APP_BASE_URL/whatsapp/{{1}}, {{1}} = telefone do tutor só com dígitos,
// gerado por normalizarTelefone() em supabase/functions/_shared/
// meta-whatsapp.ts) e essa rota só repassa pro wa.me de verdade.
//
// Só dígitos chegam aqui na prática (normalizarTelefone), mas o filtro
// abaixo garante isso mesmo assim — sem ele, esta rota seria um redirect
// aberto pra qualquer coisa que alguém colocasse no parâmetro.
export async function GET(_request: NextRequest, { params }: { params: { telefone: string } }) {
  const digitos = params.telefone.replace(/\D/g, "");
  return NextResponse.redirect(`https://wa.me/${digitos}`);
}
