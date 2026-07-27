-- =====================================================================
-- Sistema TI · CONFERÊNCIA DE COLUNAS
-- ---------------------------------------------------------------------
-- Rode sempre que aparecer um erro do tipo:
--
--   Could not find the 'xxx' column of 'yyy' in the schema cache
--
-- Esse erro significa que o código passou a gravar um campo que a tabela
-- ainda não tem. Foi o que aconteceu com "compraEstoque" em movimentos: a
-- venda simplesmente não era gravada, e antes do tratamento de erro isso
-- acontecia em silêncio — o estoque baixava e o dinheiro não entrava.
--
-- Este arquivo repete TODAS as colunas opcionais que o sistema usa. É
-- seguro rodar quantas vezes quiser: "if not exists" não altera o que já
-- está certo e não apaga nada.
-- =====================================================================

-- ---------- Movimentos de caixa ----------
-- Marca a saída que é reposição de estoque, e não despesa do mês.
alter table movimentos add column if not exists "compraEstoque" boolean default false;
alter table movimentos add column if not exists "custoRelacionado" numeric default 0;
alter table movimentos add column if not exists "sessaoId" text;
alter table movimentos add column if not exists "osId" text;

-- ---------- Ordens de serviço ----------
alter table ordens add column if not exists "aprovadoEm" text;
alter table ordens add column if not exists "recusadoEm" text;
alter table ordens add column if not exists "assinaturaCliente" text;
alter table ordens add column if not exists "prontaEm" text;
alter table ordens add column if not exists "entregueEm" text;

-- ---------- Produtos ----------
alter table produtos add column if not exists "categoriaId" text;
alter table produtos add column if not exists "subcategoriaId" text;
alter table produtos add column if not exists "fornecedorId" text;
alter table produtos add column if not exists servico boolean default false;

-- ---------- Clientes ----------
alter table clientes add column if not exists "tipoPessoa" text default 'fisica';
alter table clientes add column if not exists "nomeFantasia" text;
alter table clientes add column if not exists "inscricaoEstadual" text;

-- ---------- Fiado ----------
alter table fiados add column if not exists vencimento text;
alter table fiados add column if not exists "osId" text;

-- ---------- Sessões de caixa ----------
alter table sessoes add column if not exists observacoes text;
alter table sessoes add column if not exists "valorFechamento" numeric;

-- ---------- Confere o resultado ----------
-- Deve listar compraEstoque, custoRelacionado, osId e sessaoId.
select column_name, data_type
  from information_schema.columns
 where table_name = 'movimentos'
 order by ordinal_position;
