-- =====================================================================
-- Sistema TI · CASCO RETORNÁVEL (loja de bebidas)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- O cliente leva 12 garrafas e devolve 8: ficam 4 com ele. O saldo é a
-- soma dos lançamentos de ida (+) e volta (-), por cliente e tipo de
-- vasilhame. Lançamento não se apaga: correção é um lançamento novo, e o
-- histórico mostra os dois — saldo que muda sem rastro é saldo em que
-- ninguém confia na hora de cobrar o cliente.
-- =====================================================================

create table if not exists cascos (
  id text primary key,
  "lojaId" uuid,
  "clienteId" text,
  tipo text,
  quantidade integer,
  "vendaId" text,
  "vendaNumero" integer,
  obs text,
  "criadoEm" text
);

create index if not exists cascos_loja_idx on cascos ("lojaId", "clienteId");

alter table cascos enable row level security;

drop policy if exists "loja_ler" on cascos;
create policy "loja_ler" on cascos
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on cascos;
create policy "loja_inserir" on cascos
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

-- Só existe porque a gravação da tela é upsert (a fila reenvia o mesmo id
-- quando a internet volta). Não tem política de apagar, de propósito.
drop policy if exists "loja_alterar" on cascos;
create policy "loja_alterar" on cascos
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

-- O produto diz qual vasilhame ele leva. Vazio = não tem casco.
alter table produtos add column if not exists casco text;

-- Confere: deve aparecer "cascos | 9" (a tabela e as 9 colunas).
select 'cascos' as tabela, count(*) as colunas
  from information_schema.columns
 where table_schema = 'public' and table_name = 'cascos';
