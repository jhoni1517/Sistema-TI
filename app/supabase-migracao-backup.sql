-- =====================================================================
-- Sistema TI · BACKUP AUTOMÁTICO DIÁRIO
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- Depósito PRIVADO "backups". O robô grava um arquivo por loja por dia,
-- em <loja>/<data>.json.enc, cifrado com a chave da própria loja, e apaga
-- o que passou de 30 dias.
--
-- Quem lê: dono e gerente da própria loja (é o que restaura).
-- Quem grava: o robô (chave de serviço) e o botão "Fazer backup agora".
-- Ninguém de fora apaga nem troca um backup: sem política de update e de
-- delete, só o robô mexe.
--
-- Backup funciona mesmo com a assinatura vencida: a trava do sistema
-- nunca sequestra dado.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "backups_ler" on storage.objects;
create policy "backups_ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = loja_atual()::text
    and papel_atual() in ('dono', 'gerente')
  );

drop policy if exists "backups_enviar" on storage.objects;
create policy "backups_enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = loja_atual()::text
    and papel_atual() in ('dono', 'gerente')
  );

select id, public from storage.buckets where id = 'backups';
