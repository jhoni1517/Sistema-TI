-- =====================================================================
-- Sistema TI · IMAGENS (logo da loja e foto de produto)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase. É seguro repetir.
--
-- Cria o depósito de arquivos e as regras de quem pode escrever nele.
-- Não precisa mexer no painel de Storage na mão.
--
-- POR QUE O ARQUIVO NÃO VAI NO BANCO: guardar a imagem em base64 dentro da
-- linha engordaria "produtos", que é lido inteiro em toda carga. Cem
-- produtos com foto virariam dezenas de MB a cada F5, no 4G do balcão. No
-- banco fica só o endereço.
-- =====================================================================

-- ---------- O depósito ----------
-- public = true: a imagem é aberta por quem tiver o endereço. Precisa ser,
-- porque ela aparece no recibo impresso e na página que o cliente abre sem
-- login. Logo de loja e foto de mercadoria não são segredo — o que NÃO pode
-- é qualquer um ESCREVER, e disso cuidam as políticas abaixo.
--
-- 5 MB por arquivo é folga larga: a tela encolhe a foto antes de enviar e
-- ela costuma sair com menos de 200 KB. O limite existe para o caso de
-- alguém subir por fora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens', 'imagens', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Quem pode mexer ----------
-- O caminho é sempre "<id da loja>/pasta/arquivo.jpg". A primeira parte do
-- caminho tem que ser a loja de quem está logado: caminho montado na tela
-- não protege nada, a trava é aqui.
--
-- E vale a mesma régua do resto do sistema: assinatura vencida consulta e
-- imprime, mas não grava.

drop policy if exists "imagens_ler" on storage.objects;
create policy "imagens_ler" on storage.objects
  for select
  using (bucket_id = 'imagens');

drop policy if exists "imagens_enviar" on storage.objects;
create policy "imagens_enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imagens'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  );

drop policy if exists "imagens_substituir" on storage.objects;
create policy "imagens_substituir" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'imagens'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  )
  with check (
    bucket_id = 'imagens'
    and (storage.foldername(name))[1] = loja_atual()::text
  );

drop policy if exists "imagens_apagar" on storage.objects;
create policy "imagens_apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imagens'
    and (storage.foldername(name))[1] = loja_atual()::text
    and loja_pode_gravar()
  );

-- ---------- Onde o endereço fica guardado ----------
-- A logo da loja mora no JSON de configurações (Config.logoUrl) e por isso
-- não precisa de coluna. A foto do produto precisa.
alter table produtos add column if not exists "imagemUrl" text;

-- ---------- Confere ----------
select id, public, file_size_limit from storage.buckets where id = 'imagens';
