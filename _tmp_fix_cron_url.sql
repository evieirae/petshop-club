-- Arquivo temporário — NÃO é uma migration, não faz parte do histórico
-- versionado (supabase/migrations/). Rode manualmente no SQL Editor do
-- Supabase e pode apagar depois.
--
-- Corrige só a URL do job "lembretes-enviar" criado em
-- 0005_fase5_lembretes_whatsapp.sql (cron.schedule faz upsert pelo nome do
-- job — rodar de novo com o mesmo nome substitui o comando antigo, não
-- duplica). Não precisa re-rodar o resto do arquivo 0005.
--
-- Antes de rodar: troque <seu-project-ref-real> pela referência do seu
-- projeto (Project Settings > General > Reference ID, ou a parte antes de
-- ".supabase.co" na sua NEXT_PUBLIC_SUPABASE_URL).

select cron.schedule(
    'lembretes-enviar',
    '*/2 * * * *',
    $$
    select net.http_post(
        url := 'https://<seu-project-ref-real>.supabase.co/functions/v1/enviar-lembretes',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Conferir que pegou o valor certo:
select jobname, command from cron.job where jobname = 'lembretes-enviar';
