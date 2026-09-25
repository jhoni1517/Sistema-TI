-- =====================================================================
-- Sistema TI · TROCAS COM FORNECEDOR (RMA)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- Peça que voltou com defeito e precisa ir de volta para o fornecedor.
-- E a entrada de mercadoria passa a guardar o que veio, de quem e qual
-- nota — é o que permite achar de onde veio a peça meses depois.
-- =====================================================================

create table if not exists rmas (
  id text primary key,
  "lojaId" uuid,
  "osId" text,
  "osNumero" integer,
  "produtoId" text,
  descricao text,
  quantidade numeric,
  valor numeric,
  fornecedor text,
  "dataCompra" text,
  "numeroNota" text,
  "movimentoEntradaId" text,
  "garantiaFornecedorDias" integer,
  fotos jsonb,
  defeito text,
  status text,
  historico jsonb,
  "valorRecuperado" numeric,
  "criadoEm" text,
  "atualizadoEm" text
);

create index if not exists rmas_loja_idx on rmas ("lojaId");

alter table rmas enable row level security;

drop policy if exists "loja_ler" on rmas;
create policy "loja_ler" on rmas
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on rmas;
create policy "loja_inserir" on rmas
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on rmas;
create policy "loja_alterar" on rmas
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_apagar" on rmas;
create policy "loja_apagar" on rmas
  for delete to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar());

-- A entrada de mercadoria guarda os itens, o fornecedor e a nota.
alter table movimentos add column if not exists "itensEntrada" jsonb;
alter table movimentos add column if not exists fornecedor text;
alter table movimentos add column if not exists "numeroNota" text;

select 'ok' as resultado;
