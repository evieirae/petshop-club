# PetClub — painel operacional

Fundação técnica do painel: Next.js (App Router) + Supabase (auth + banco) +
Tailwind. As telas de operação de verdade (agenda, tutores, planos,
configurações) ainda são placeholders — a ideia era deixar login, navegação
e o contexto de petshop logado já funcionando, pra cada tela nova só entrar
como conteúdo dentro dessa estrutura.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** — Postgres + Auth + RLS (schema em `supabase/migrations/0001_init.sql`, é o mesmo `clube_banho_tosa_schema.sql` já construído)
- **Tailwind CSS** com tokens próprios (ver `docs/design-tokens.md`)
- **@supabase/ssr** pra sessão funcionar em Server Components e middleware

## Rodando localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie um projeto no [Supabase](https://supabase.com) (se ainda não tiver
   um pra esse produto) e rode as migrations, na ordem, pelo SQL Editor do
   dashboard: primeiro `supabase/migrations/0001_init.sql` (cria todas as
   tabelas, triggers e policies de RLS), depois
   `supabase/migrations/0002_admin_plataforma.sql` (papel de admin da
   plataforma — ver Fase 1 do ROADMAP.md).

3. Copie `.env.example` pra `.env.local` e preencha com a URL e a anon key
   do seu projeto (Project Settings → API no dashboard do Supabase):
   ```bash
   cp .env.example .env.local
   ```

4. Crie seu primeiro usuário de equipe:
   - Cadastre um usuário em Authentication → Users no dashboard do Supabase
     (ou pelo fluxo de auth quando ele existir na UI).
   - Insira uma linha em `usuarios_petshop` ligando esse `auth_user_id` a um
     `petshop_id` — sem isso o login funciona, mas a tela mostra "acesso
     pendente" (é o comportamento esperado, ver `app/(app)/layout.tsx`).

5. Rode o projeto:
   ```bash
   npm run dev
   ```
   Abre em http://localhost:3000 — vai te mandar pro `/login`.

## Estrutura

```
app/
  (auth)/login/        página de login (pública)
  (app)/                grupo protegido — layout resolve sessão + petshop
    page.tsx            visão geral
    agenda/              placeholder
    tutores/              placeholder
    planos/               placeholder
    configuracoes/         placeholder
components/
  nav/                  Sidebar, Topbar, botão de logout
  ui/                   EmptyState, NavCard — reutilizáveis pelas telas futuras
lib/
  supabase/             clientes (browser, server, middleware)
  auth/getContext.ts    resolve usuário logado + petshop dele
supabase/migrations/    schema (mesmo arquivo já existente no projeto)
docs/                   regras de negócio, ER diagram, tokens de design
```

## Subindo pro GitHub

Esse repositório já nasce com o histórico de commits localmente. Falta só
criar o repositório remoto (vazio, sem README/gitignore) e apontar pra ele:

**Opção A — GitHub CLI** (se tiver o `gh` instalado e autenticado):
```bash
gh repo create petclub --private --source=. --remote=origin --push
```

**Opção B — pelo site do GitHub:**
1. Crie um repositório vazio em https://github.com/new (sem inicializar com
   README, .gitignore ou licença — pra não conflitar com o histórico local).
2. Depois:
   ```bash
   git remote add origin git@github.com:SEU_USUARIO/petclub.git
   git branch -M main
   git push -u origin main
   ```

## Próximos passos

- Ligar `Vercel` no repositório pra deploy automático a cada push (as env
  vars do `.env.local` precisam ser cadastradas lá também, em Project
  Settings → Environment Variables).
- Construir a primeira tela de verdade — a mais natural é **Configurações**,
  já que é o checklist de onboarding de um petshop novo (seção 7 de
  `docs/regras_padrao_petshop.md`) e todo o resto depende dela existir.
