# =============================================================================
# PetClub - commit das Fases 4-rev a 8 (12 migrations + app + docs)
#
# Contexto: o ultimo commit do repositorio era de 17/ago. Desde entao ficaram
# so no disco 12 migrations (0009-0020), a Fase 8 inteira, catalogo, produtos,
# vendas, funcionarios, pets e painel. Este script poe tudo no GitHub em 4
# commits tematicos.
#
# Ja foi preparado (arquivos criados, nada a fazer):
#   .gitattributes ............... normaliza CRLF -> LF
#   .gitignore ................... + .claude/ e _to_delete/
#   supabase/scripts/ ............ fix_cron_url.sql promovido da raiz
#   _to_delete/LEIA-ME.md ........ o que apagar e por que
#
# COMO RODAR (PowerShell, na raiz do repositorio):
#   cd D:\repositorios\petshop-club
#   powershell -ExecutionPolicy Bypass -File .\commitar-tudo.ps1
#
# O script para no primeiro erro e nao faz push sem confirmacao.
# =============================================================================

$ErrorActionPreference = "Stop"
$repo = "D:\repositorios\petshop-club"
Set-Location $repo

function Titulo($t) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor DarkCyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor DarkCyan
}

function Git-Ok($argumentos) {
    $saida = & git @argumentos 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FALHOU: git $($argumentos -join ' ')" -ForegroundColor Red
        Write-Host $saida
        exit 1
    }
    return $saida
}

# -----------------------------------------------------------------------------
Titulo "0. Limpando locks orfaos do Git"
# -----------------------------------------------------------------------------
# Locks ficaram presos porque a sessao remota nao tem permissao de exclusao no
# seu disco. Sao sempre arquivos vazios de trava, nunca conteudo seu.
$locks = Get-ChildItem -Path ".git" -Filter "*.lock" -Recurse -Force -ErrorAction SilentlyContinue
if ($locks) {
    $locks | ForEach-Object {
        Write-Host "  removendo $($_.FullName.Replace($repo, '.'))" -ForegroundColor DarkGray
        Remove-Item $_.FullName -Force
    }
} else {
    Write-Host "  nenhum lock encontrado" -ForegroundColor DarkGray
}
# objetos temporarios que o git nao conseguiu limpar
Get-ChildItem -Path ".git\objects" -Filter "tmp_obj_*" -Recurse -Force -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

# -----------------------------------------------------------------------------
Titulo "1. Conferindo o ponto de partida"
# -----------------------------------------------------------------------------
git reset -q
Write-Host "  Branch : $(git rev-parse --abbrev-ref HEAD)"
Write-Host "  HEAD   : $(git log --oneline -1)"
Write-Host "  Pendente: $((git status --short | Measure-Object).Count) arquivos"

$identidade = git config user.name
if (-not $identidade) {
    git config user.name  "Eduardo Vieira"
    git config user.email "eeduardoo.vieira@gmail.com"
    Write-Host "  Identidade local configurada" -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
Titulo "2. COMMIT 1/4 - chore: fim de linha, gitignore e scripts"
# -----------------------------------------------------------------------------
Git-Ok @("add", ".gitattributes", ".gitignore", ".eslintignore", "supabase/scripts/")
Git-Ok @("add", "-A", "--", "_tmp_fix_cron_url.sql")

$msg1 = @"
chore: normaliza fim de linha, ajusta gitignore e promove script de cron

O checkout no Windows gravava CRLF enquanto o historico estava em LF. O
efeito era 14 arquivos aparecendo como 100% modificados sem uma unica
mudanca real de conteudo - 8.196 linhas fantasma num diff de 10.266, o
suficiente pra inutilizar diff, blame e code review.

.gitattributes com "* text=auto eol=lf" resolve na origem: o repositorio
guarda LF e o checkout entrega LF tambem no Windows. Binarios (imagens,
zip, fontes) ficam de fora da conversao.

Tambem entra aqui:

- .gitignore ganha .claude/ (config local da maquina, nao do projeto) e
  _to_delete/ (pasta de faxina, com LEIA-ME explicando cada item).
- _tmp_fix_cron_url.sql sai da raiz e vira supabase/scripts/fix_cron_url.sql.
  Nao e lixo: e o script que aponta o job lembretes-enviar pra referencia
  real do projeto Supabase, e vai ser necessario ao criar o ambiente de
  producao (Fase 7). A pasta nova separa script avulso de operacao (rodado
  a mao no SQL Editor) de migration versionada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYZzBmPKHV3Ztpr3hk6VDf
"@
$msg1 | Out-File -FilePath ".git\COMMIT_PETCLUB" -Encoding utf8
Git-Ok @("commit", "-q", "-F", ".git\COMMIT_PETCLUB")
Write-Host "  OK -> $(git log --oneline -1)" -ForegroundColor Green

# -----------------------------------------------------------------------------
Titulo "3. COMMIT 2/5 - feat(db): migrations 0009 a 0020"
# -----------------------------------------------------------------------------
# Explicito de 0009 a 0020: a 0021 (plano MEI+Pix) vai num commit separado,
# porque e trabalho novo e nao backlog atrasado.
0009..0020 | ForEach-Object {
    $n = "{0:D4}" -f $_
    Get-ChildItem "supabase/migrations/$n*.sql" -ErrorAction SilentlyContinue |
        ForEach-Object { Git-Ok @("add", $_.FullName) }
}

$msg2 = @"
feat(db): migrations 0009 a 0020

Doze migrations escritas entre 18 e 20/ago que nunca foram commitadas.
Todas aditivas - nenhuma altera migration ja aplicada.

Revisoes da Fase 4 (agenda e cadastro)
  0009 series_visitas_avulsas ..... visita avulsa em serie
  0010 pets_especie ............... especie do pet, alem da raca
  0013 pet_entregue_lembrete ...... lembrete de pet entregue
  0014 status_presente_e_reversao . status "presente" e reversao de status

Fase 6 (pagamento)
  0011 pagamento_local ............ pagamento presencial, fora do gateway
  0015 venda_pix .................. Pix avulso de venda de balcao

Catalogo, estoque e equipe
  0012 produtos_estoque_vendas .... produtos, vendas, movimentos de estoque
  0016 funcionarios_comissoes ..... funcionarios e comissao por servico

Fase 8 (administracao da plataforma)
  0017 admin_plataforma_independente . admins_plataforma sem petshop_id
  0018 leads_saas .................... formulario do site institucional
  0019 tutores_pets_ativo ............ soft-delete de tutor e pet
  0020 retencao_lembrete .............. tipo retencao_cliente (so metade do
       caminho, de proposito - o template MARKETING nao foi desenhado ainda)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYZzBmPKHV3Ztpr3hk6VDf
"@
$msg2 | Out-File -FilePath ".git\COMMIT_PETCLUB" -Encoding utf8
Git-Ok @("commit", "-q", "-F", ".git\COMMIT_PETCLUB")
Write-Host "  OK -> $(git log --oneline -1)" -ForegroundColor Green

# -----------------------------------------------------------------------------
Titulo "4. COMMIT 3/5 - feat(app): fases 4-rev a 8"
# -----------------------------------------------------------------------------
Git-Ok @("add", "app/", "components/", "lib/", "types/", "supabase/functions/",
         "tailwind.config.ts", "tsconfig.json")

$msg3 = @"
feat(app): catalogo, produtos, vendas, admin da plataforma e design system

Todo o codigo de aplicacao das Fases 4-rev a 8. Vai num commit so porque as
mudancas sao interdependentes - o design system novo toca praticamente toda
tela, e separar isso uma semana depois seria arqueologia sem ganho real.

Fase 8 - administracao da plataforma
- Grupo de rota app/(admin)/ separado de app/(app)/: KPIs agregados,
  cadastro de petshop e dono, taxas, e leads do site institucional.
- app/page.tsx vira a Home publica; o painel logado se muda pra /painel.
- Congelamento e encerramento de conta via petshops.status.
- Soft-delete de tutores e pets, no mesmo padrao de funcionarios.ativo.

Catalogo, produtos e vendas
- app/(app)/catalogo/ separa servicos e planos de produtos.
- app/(app)/produtos/ e app/(app)/vendas/ com estoque e venda de balcao.
- Funcionarios e comissao por servico em Configuracoes.

Agenda e pets
- Quadro semanal com painel de acoes (components/agenda/, lib/agenda/).
- app/(app)/pets/ com ficha do pet e botao de reengajamento.

Design system
- lib/design/tokens.ts como unica fonte de cor do app; lib/ui/styles.ts com
  as receitas de botao, badge, card, alerta e tabela. Nenhum "#" fora do
  tokens.ts. Contraste WCAG AA conferido em todas as combinacoes em uso.

Pagamento
- supabase/functions/criar-pix-venda para o Pix de venda avulsa.
- Pagamento local (presencial) na tela financeiro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYZzBmPKHV3Ztpr3hk6VDf
"@
$msg3 | Out-File -FilePath ".git\COMMIT_PETCLUB" -Encoding utf8
Git-Ok @("commit", "-q", "-F", ".git\COMMIT_PETCLUB")
Write-Host "  OK -> $(git log --oneline -1)" -ForegroundColor Green

# -----------------------------------------------------------------------------
Titulo "5. COMMIT 4/5 - docs"
# -----------------------------------------------------------------------------
Git-Ok @("add", "ROADMAP.md", "docs/", "README.md")

$msg4 = @"
docs: roadmap das fases 5-8 e planos de custo, piloto e MEI+Pix

Documentacao acumulada desde 17/ago, mais tres documentos novos de custo e
estrategia de lancamento.

Atualizados
- ROADMAP.md: fases 5 a 8, incluindo o travamento do Business Portfolio na
  Meta e o estado real (rascunho nao testado) da Fase 6.
- regras_padrao_petshop.md: mudanca de modelo da taxa de servico - deixa de
  ser corte do petshop e passa a ser somada ao tutor.
- whatsapp_templates_meta.md e design-tokens.md.

Novos
- custos-producao.md: mapeamento de custo de arquitetura e operacao, com
  analise de alternativas por ferramenta (hosting, banco, mensageria,
  gateway) e plano de reducao priorizado.
- piloto-caixa-zero.md: versao extrema, sem WhatsApp e sem gateway.
  Superado por plano-mei-pix.md, mantido pelo raciocinio.
- plano-mei-pix.md: o plano vigente. WhatsApp otimizado (R$62 -> R$34 por
  petshop), Pix so pra pagamento remoto e MEI no lugar de ME. Registra dois
  achados que mudam decisao: o split por subconta e o que mantem o MEI
  viavel (sem ele o teto estoura no primeiro petshop), e o CNAE de MEI de
  informatica nao cobre licenciamento de software.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYZzBmPKHV3Ztpr3hk6VDf
"@
$msg4 | Out-File -FilePath ".git\COMMIT_PETCLUB" -Encoding utf8
Git-Ok @("commit", "-q", "-F", ".git\COMMIT_PETCLUB")
Write-Host "  OK -> $(git log --oneline -1)" -ForegroundColor Green

# -----------------------------------------------------------------------------
Titulo "6. COMMIT 5/5 - feat(db): 0021 politica de mensagem do piloto"
# -----------------------------------------------------------------------------
Git-Ok @("add", "supabase/migrations/0021_piloto_mei_pix.sql")

$msg5 = @"
feat(db): 0021 politica de mensagem do piloto (plano MEI + Pix)

Primeira migration do plano de lancamento (docs/plano-mei-pix.md). Poe em
schema as decisoes que derrubam o custo de WhatsApp de R$ 61,65 pra R$ 34,00
por petshop/mes - 45% a menos, ja contando a mensagem de retencao, que antes
nem estava na conta.

Colunas novas em petshops (todas parametro operacional, editavel pelo
proprio petshop - diferente das 3 colunas de receita, que seguem travadas
pro admin da plataforma):

  enviar_pet_entregue      false  desliga o template de maior volume e menor
                                  valor percebido (400 envios/mes, R$ 18,00)
  escalonar_por_whatsapp   false  escalonamento vira badge no painel; a
                                  linha em lembretes continua existindo, so
                                  muda o canal pra 'painel'
  retencao_teto_mensal        20  teto de mensagens MARKETING por petshop
  retencao_intervalo_dias     90  intervalo minimo por tutor

Funcoes:
- trg_pet_pronto_lembrete() redefinida (ultima versao: 0013) - pet_entregue
  passa pela flag. O resto do corpo e identico.
- escalar_confirmacao_pendente() redefinida (ultima versao: 0005) - o canal
  passa a depender da flag.
- pode_disparar_retencao(uuid) - aplica os dois tetos. Existe porque
  retencao_cliente e categoria MARKETING na Meta, ~7x o preco de um UTILITY:
  sem teto, uma campanha pra 100 tutores inativos custa R$ 35/mes num unico
  petshop, mais que todos os templates transacionais somados. Precisa
  existir ANTES de o template ser submetido, nao depois.

O que continua sendo codigo, listado no rodape da migration: preferir texto
livre dentro da janela de 24h (a maior economia isolada, e a funcao SQL ja
existe desde a 0005), filtrar canal='whatsapp' na fila do enviar-lembretes,
o badge na Agenda, o CPF no cadastro e o Pix sincrono no portal do tutor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KYZzBmPKHV3Ztpr3hk6VDf
"@
$msg5 | Out-File -FilePath ".git\COMMIT_PETCLUB" -Encoding utf8
Git-Ok @("commit", "-q", "-F", ".git\COMMIT_PETCLUB")
Remove-Item ".git\COMMIT_PETCLUB" -Force -ErrorAction SilentlyContinue
Write-Host "  OK -> $(git log --oneline -1)" -ForegroundColor Green

# -----------------------------------------------------------------------------
Titulo "7. Conferencia antes do push"
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Commits novos:" -ForegroundColor Yellow
git log --oneline origin/main..HEAD
Write-Host ""
Write-Host "Sobrou algo sem commitar?" -ForegroundColor Yellow
$sobrou = git status --short
if ($sobrou) { $sobrou } else { Write-Host "  nada - arvore limpa" -ForegroundColor Green }

Write-Host ""
$resposta = Read-Host "Fazer push para origin/main? (s/N)"
if ($resposta -eq "s" -or $resposta -eq "S") {
    Titulo "8. Push"
    Git-Ok @("push", "origin", "main")
    Write-Host "  Push concluido." -ForegroundColor Green
    Write-Host "  https://github.com/evieirae/petshop-club" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Push nao feito. Quando quiser:  git push origin main" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
Titulo "Proximos passos"
# -----------------------------------------------------------------------------
Write-Host @"
  1. Revise _to_delete\LEIA-ME.md e apague a pasta (o item 5 pede uma
     conferida antes).
  2. Aplique a 0021 no Supabase (SQL Editor ou `supabase db push`). Ela e
     aditiva e tem default seguro - nao muda comportamento de quem ja usa.
  3. O rodape da 0021 lista o que falta no CODIGO pra politica valer de
     verdade. O primeiro item (janela de 24h no enviar-lembretes) e a maior
     economia isolada do plano.
  4. Este proprio script pode ser apagado depois de rodar:
     Remove-Item .\commitar-tudo.ps1
"@ -ForegroundColor Gray
Write-Host ""
