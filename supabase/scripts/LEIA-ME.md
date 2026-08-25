# Scripts avulsos de operação

Scripts que **não são migrations**: rodam manualmente no SQL Editor do
Supabase, não entram no histórico versionado do schema e não são idempotentes
por natureza. Migrations continuam em `supabase/migrations/`.

| Script | Quando rodar |
|---|---|
| `fix_cron_url.sql` | Ao criar um projeto Supabase novo (produção). Aponta o job `lembretes-enviar` para a referência real do projeto — a `0005_fase5_lembretes_whatsapp.sql` grava um placeholder `<PROJECT_REF>` de propósito, porque a referência não é schema, é ambiente. |
