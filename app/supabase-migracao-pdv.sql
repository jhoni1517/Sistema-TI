-- =====================================================================
-- Sistema TI · FRENTE DE CAIXA (mercearia, adega, lanchonete)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
-- É seguro repetir: tudo aqui é "if not exists" ou recria a política.
-- =====================================================================

-- ---------- Vendas de balcão ----------
-- A venda existe como registro próprio, e não só como uma linha no caixa,
-- porque numa mercearia o que importa é O QUE saiu, não apenas quanto
-- entrou. Sem os itens não há como saber o que mais vende, reimprimir um
-- cupom nem conferir uma devolução.
create table if not exists vendas (
  id text primary key,
  numero integer not null default 1,
  -- Itens em jsonb: o preço e o custo ficam CONGELADOS no momento da venda.
  -- Guardar só o id do produto faria o cupom de ontem mudar quando o preço
  -- subisse hoje, e o lucro do mês passado seria recalculado sozinho.
  itens jsonb not null default '[]'::jsonb,
  desconto numeric not null default 0,
  "formaPagamento" text not null default 'dinheiro',
  "valorRecebido" numeric,
  "clienteId" text,
  "movimentoId" text,
  "sessaoId" text,
  "criadoEm" text,
  "lojaId" uuid
);

create index if not exists vendas_loja_idx on vendas ("lojaId");
create index if not exists vendas_data_idx on vendas ("lojaId", "criadoEm");

-- ---------- Campos de produto ----------
-- Código de barras: é por ele que o leitor do balcão acha o produto.
alter table produtos add column if not exists "codigoBarras" text;
-- Vendido por quilo: o preço passa a ser o do QUILO e a quantidade vira
-- fracionária (0,315 kg).
alter table produtos add column if not exists "porPeso" boolean default false;
-- Vencimento do lote. Vira alerta no estoque.
alter table produtos add column if not exists validade text;
-- Código curto do produto na balança. A etiqueta impressa é única por
-- pacote (traz o peso dentro); o que se repete entre elas é este número.
alter table produtos add column if not exists "codigoBalanca" text;
create index if not exists produtos_balanca_idx on produtos ("lojaId", "codigoBalanca");

-- Busca por código de barras precisa ser rápida: é o caminho do leitor.
create index if not exists produtos_codigo_idx on produtos ("lojaId", "codigoBarras");

alter table vendas enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só vê o que é seu, e a
-- gravação exige assinatura em dia.
drop policy if exists "loja_ler" on vendas;
create policy "loja_ler" on vendas
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on vendas;
create policy "loja_inserir" on vendas
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on vendas;
create policy "loja_alterar" on vendas
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_apagar" on vendas;
create policy "loja_apagar" on vendas
  for delete to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar());

-- ---------- Confere ----------
select column_name, data_type
  from information_schema.columns
 where table_name = 'vendas'
 order by ordinal_position;
