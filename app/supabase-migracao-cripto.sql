-- =====================================================================
-- Sistema TI · CRIPTOGRAFIA DAS SENHAS DE APARELHO
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
--
-- Problema que isto resolve: a OS guarda a senha do celular do cliente.
-- Em texto puro, ela aparece em qualquer backup, em qualquer exportação e
-- para qualquer pessoa que abra o painel do banco. Guardar senha de
-- terceiro assim é o maior risco jurídico do sistema (LGPD, art. 46).
--
-- Depois desta migração a senha vira um bloco cifrado com AES-256. A chave
-- é de cada loja e só sai do banco para quem está logado naquela loja.
-- =====================================================================

-- ---------- Chave de criptografia por loja ----------
alter table lojas add column if not exists chave_cripto text;

-- 32 bytes aleatórios por loja (AES-256)
update lojas
   set chave_cripto = encode(gen_random_bytes(32), 'base64')
 where chave_cripto is null;

-- Toda loja criada daqui para frente já nasce com a sua
alter table lojas
  alter column chave_cripto set default encode(gen_random_bytes(32), 'base64');

-- ---------- Registro de quem revelou uma senha ----------
-- Sem isto, "quem viu a senha do cliente?" não tem resposta. Com isto,
-- tem data, hora e nome — o que também desestimula a curiosidade.
create table if not exists acessos_sigilo (
  id uuid primary key default gen_random_uuid(),
  "lojaId" uuid not null references lojas (id) on delete cascade,
  usuario_id uuid references auth.users (id) on delete set null,
  os_numero integer,
  "criadoEm" timestamptz not null default now()
);

create index if not exists acessos_sigilo_loja_idx
  on acessos_sigilo ("lojaId", "criadoEm" desc);

alter table acessos_sigilo enable row level security;

-- Qualquer pessoa da loja registra o próprio acesso...
drop policy if exists "sigilo_registrar" on acessos_sigilo;
create policy "sigilo_registrar" on acessos_sigilo
  for insert to authenticated
  with check ("lojaId" = loja_atual() and usuario_id = auth.uid());

-- ...mas só dono e gerente leem o histórico, e ninguém apaga.
drop policy if exists "sigilo_ler" on acessos_sigilo;
create policy "sigilo_ler" on acessos_sigilo
  for select to authenticated
  using ("lojaId" = loja_atual() and papel_atual() in ('dono', 'gerente'));

-- =====================================================================
-- DEPOIS DE RODAR:
--   Nada. As OS novas já salvam a senha cifrada. As antigas continuam
--   legíveis e são convertidas assim que a OS for salva de novo.
-- =====================================================================
