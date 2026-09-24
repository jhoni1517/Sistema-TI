-- =====================================================================
-- Sistema TI · LOJA DE EXEMPLO (contato de vendas)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- A loja de exemplo abre SEM login, e o botão "Criar minha conta grátis"
-- precisa do WhatsApp de quem vende o sistema. Esse número mora em
-- sistema_config, que só quem está logado lê — e lá também moram a chave
-- Pix e os valores. Esta função é a única porta, e dela sai só o número.
-- =====================================================================

create or replace function contato_do_sistema()
returns text
language sql stable security definer set search_path = public
as $$
  select nullif(regexp_replace(coalesce(whatsapp_suporte, ''), '\D', '', 'g'), '')
    from sistema_config
   where id;
$$;

revoke all on function contato_do_sistema() from public;
grant execute on function contato_do_sistema() to anon, authenticated;

select 'ok' as resultado;
