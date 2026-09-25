-- =====================================================================
-- Sistema TI · CÓDIGO DE RETIRADA (PIN) E DOCUMENTO DE QUEM RETIROU
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- O código nasce quando a OS fica pronta e só o cliente recebe: pelo link
-- de acompanhamento (esta função) e pela mensagem de pronto.
--
-- Entrega sem código exige foto do documento de quem levou. Documento é
-- dado sensível: vai para um depósito PRIVADO (não o de imagens, que é
-- público por endereço). Só a própria loja lê, por link que expira.
-- =====================================================================

alter table ordens add column if not exists "pinRetirada" text;
alter table ordens add column if not exists retirada jsonb;

-- O código só sai com o segredo do link, e só enquanto a OS está pronta.
create or replace function pin_da_os(p_loja uuid, p_numero integer, p_token text)
returns text
language sql stable security definer set search_path = public
as $$
  select "pinRetirada"
    from ordens
   where "lojaId" = p_loja
     and numero = p_numero
     and rastreio = nullif(trim(coalesce(p_token, '')), '')
     and status = 'pronta'
   limit 1;
$$;

revoke all on function pin_da_os(uuid, integer, text) from public;
grant execute on function pin_da_os(uuid, integer, text) to anon, authenticated;

-- ---------- Depósito privado de documentos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentos_ler" on storage.objects;
create policy "documentos_ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = loja_atual()::text);

drop policy if exists "documentos_enviar" on storage.objects;
create policy "documentos_enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  );

select 'ok' as resultado;
